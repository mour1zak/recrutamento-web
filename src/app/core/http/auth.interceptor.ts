import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, take, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SKIP_AUTH_HEADER } from './api-client';

/**
 * Rotas de autenticação em si: não recebem Bearer e não disparam renovação
 * (senão um login com senha errada derrubaria a sessão de outra aba, e o
 * próprio refresh entraria em loop).
 */
const AUTH_ROUTES = ['auth/login', 'auth/register', 'auth/refresh', 'auth/logout'];

/**
 * Rotas públicas do backend (só `x-api-key`, sem JWT): não recebem Bearer.
 *
 * Mandar um token expirado numa rota pública seria pior que não mandar nada — o
 * Passport devolveria `401` e a vitrine de um visitante com sessão vencida
 * dispararia um ciclo de refresh à toa (ou uma queda de sessão). `GET /jobs/:id`
 * NÃO está aqui: aquela rota exige JWT.
 */
const PUBLIC_NO_JWT_ROUTES = ['cep'];

function pathOf(url: string): string {
  const apiBase = environment.apiUrl.replace(/\/$/, '');
  return url.startsWith(apiBase) ? url.slice(apiBase.length).replace(/^\//, '') : url;
}

function isAuthRoute(url: string): boolean {
  const path = pathOf(url);
  return AUTH_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/** Rota pública sem JWT: `GET /jobs` (lista) e `GET /cep/:cep`. */
function isPublicNoJwt(url: string, method: string): boolean {
  if (method !== 'GET') return false;
  const path = pathOf(url).split('?')[0] ?? '';
  return path === 'jobs' || PUBLIC_NO_JWT_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/** 401 causado pela chave de aplicação (e não pela sessão do usuário). */
function isApiKeyProblem(error: HttpErrorResponse): boolean {
  const message = (error.error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /api key/i.test(message);
}

/**
 * Interceptor de autenticação JWT.
 *
 * Faz três coisas, no lugar certo (em vez de repetir em cada serviço):
 *  1. anexa `Authorization: Bearer <accessToken>` em toda chamada autenticada;
 *  2. em `401`, tenta renovar via `POST /auth/refresh` e repete o request
 *     original uma única vez — com single-flight no `AuthService`, então dez
 *     chamadas paralelas expiradas geram UMA renovação (o backend rotaciona o
 *     refresh token, renovar duas vezes invalidaria a sessão);
 *  3. se a renovação falhar, encerra a sessão e manda o usuário pro login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Requisições marcadas (refresh, logout) passam direto.
  if (req.headers.has(SKIP_AUTH_HEADER)) {
    return next(req.clone({ headers: req.headers.delete(SKIP_AUTH_HEADER) }));
  }

  const auth = inject(AuthService);
  const isApiCall = req.url.startsWith(environment.apiUrl.replace(/\/$/, ''));
  const skipJwt = !isApiCall || isAuthRoute(req.url) || isPublicNoJwt(req.url, req.method);

  const token = auth.accessToken();
  const outgoing =
    !skipJwt && token && !req.headers.has('Authorization')
      ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })
      : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // Chave de aplicação errada é problema de configuração do front, não de
      // sessão: derrubar o login do usuário aqui só esconderia o erro real.
      if (isApiKeyProblem(error)) {
        return throwError(() => error);
      }

      const hadCredentials = outgoing.headers.has('Authorization');
      if (skipJwt || !hadCredentials || !auth.refreshToken()) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        take(1),
        switchMap((renewed) => {
          if (!renewed) {
            // Refresh inválido/expirado/já usado → sessão acabou de verdade.
            auth.forceLogout();
            return throwError(() => error);
          }
          const fresh = auth.accessToken();
          // Se o request repetido falhar de novo, o erro sobe como está
          // (sem segunda tentativa de refresh — o outer `catchError` abaixo
          // reconhece `HttpErrorResponse` e apenas propaga).
          return next(
            fresh ? outgoing.clone({ headers: outgoing.headers.set('Authorization', `Bearer ${fresh}`) }) : outgoing,
          );
        }),
        catchError((renewError: unknown) => {
          if (renewError instanceof HttpErrorResponse) {
            return throwError(() => renewError);
          }
          // Falha inesperada na renovação (ex.: rede) → encerra a sessão.
          auth.forceLogout();
          return throwError(() => renewError);
        }),
      );
    }),
  );
};

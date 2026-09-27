import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Interceptor central de API key.
 *
 * O backend exige `x-api-key` em TODA rota — inclusive nas públicas de auth
 * (`/auth/register`, `/auth/login`, `/auth/refresh`) e na vitrine (`GET /jobs`).
 * Centralizar aqui é o que evita repetir o header em cada chamada de serviço.
 *
 * Só incide sobre requests para a URL da API: chamadas a outros hosts (nenhuma
 * hoje, mas o app poderia usar um CDN) não vazam a chave.
 */
export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBase = environment.apiUrl.replace(/\/$/, '');
  if (!req.url.startsWith(`${apiBase}/`) && req.url !== apiBase) {
    return next(req);
  }

  // Nunca reescrever o header se o chamador já o definiu explicitamente
  // (ex.: testes, ou uma segunda chave para um ambiente específico).
  if (req.headers.has('x-api-key')) {
    return next(req);
  }

  return next(req.clone({ headers: req.headers.set('x-api-key', environment.apiKey) }));
};

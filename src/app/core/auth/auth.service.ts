import { HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { ApiClient, SKIP_AUTH_HEADER } from '../http/api-client';
import type { AuthResponse, AuthUser, Company, RoleName } from '../models';

const STORAGE_KEY = 'recrutamento.session';
const COMPANY_KEY = 'recrutamento.companyId';

/**
 * Sessão em `localStorage` (não `sessionStorage`): sessionStorage é ISOLADO POR
 * ABA, então qualquer link aberto em nova aba ("ver na vitrine", ctrl+clique)
 * caía no login com a conta ativa ao lado — parecia "desconectou do nada".
 * Com localStorage a sessão é compartilhada entre abas e sobrevive a reload;
 * o botão "Sair" (e o refresh inválido) continuam limpando tudo.
 */

interface StoredSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/** Para onde cada papel vai depois do login (e quando digita a raiz do site). */
export function homePathForRole(role: RoleName | null | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'RECRUITER':
      return '/recruiter';
    case 'CANDIDATE':
      return '/jobs';
    default:
      return '/jobs';
  }
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.user?.email || !parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readStoredCompanyId(userId: number | null): number | null {
  if (userId === null) return null;
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: number; companyId: number };
    return parsed.userId === userId ? parsed.companyId : null;
  } catch {
    return null;
  }
}

/**
 * Sessão do usuário logado.
 *
 * - tokens em memória + espelho em `localStorage` (sessão compartilhada entre
 *   abas e resiliente a reload; "Sair" e refresh inválido limpam tudo);
 * - a renovação automática do access token (`POST /auth/refresh`, com rotação)
 *   é disparada pelo interceptor de auth, que chama `refresh()` daqui;
 * - `x-api-key` é anexado a TODA chamada pelo interceptor de API key.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);

  private readonly stored = readSession();

  readonly user = signal<AuthUser | null>(this.stored?.user ?? null);
  readonly accessToken = signal<string | null>(this.stored?.accessToken ?? null);
  readonly refreshToken = signal<string | null>(this.stored?.refreshToken ?? null);

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly role = computed<RoleName | null>(() => this.user()?.role ?? null);
  readonly homePath = computed(() => homePathForRole(this.role()));

  /**
   * Empresa do recrutador logado.
   *
   * O payload de login devolve apenas `{id, name, email, role}` — sem
   * `companyId`. Como o backend não tem rota "minha empresa", o id é
   * descoberto a partir de qualquer dado que o recrutador lê
   * (`GET /jobs/mine` → `companyId` da vaga) e mantido em cache na sessão
   * para as próximas telas.
   */
  readonly ownCompany = signal<Company | null>(null);
  readonly ownCompanyId = signal<number | null>(readStoredCompanyId(this.stored?.user?.id ?? null));

  private refreshInFlight: Observable<boolean> | null = null;

  // -------------------------------------------------------------------------
  // Persistência
  // -------------------------------------------------------------------------

  private persist(): void {
    const user = this.user();
    const accessToken = this.accessToken();
    const refreshToken = this.refreshToken();
    if (!user || !accessToken || !refreshToken) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, accessToken, refreshToken } satisfies StoredSession));
    } catch {
      /* modo privado / cota estourada: a sessão segue viva em memória */
    }
  }

  private applyAuth(response: AuthResponse): AuthUser {
    const previousUserId = this.user()?.id ?? null;
    this.user.set(response.user);
    this.accessToken.set(response.accessToken);
    this.refreshToken.set(response.refreshToken);
    this.persist();

    if (previousUserId !== response.user.id || response.user.role !== 'RECRUITER') {
      this.ownCompany.set(null);
      this.ownCompanyId.set(null);
      localStorage.removeItem(COMPANY_KEY);
    }
    return response.user;
  }

  /** Usado pelo interceptor após `POST /auth/refresh` (rotação de tokens). */
  setTokens(accessToken: string, refreshToken: string, user?: AuthUser): void {
    this.accessToken.set(accessToken);
    this.refreshToken.set(refreshToken);
    if (user) this.user.set(user);
    this.persist();
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  register(input: { name: string; email: string; password: string }): Observable<AuthUser> {
    return this.api.post<AuthResponse>('auth/register', input).pipe(map((response) => this.applyAuth(response)));
  }

  login(input: { email: string; password: string }): Observable<AuthUser> {
    return this.api.post<AuthResponse>('auth/login', input).pipe(map((response) => this.applyAuth(response)));
  }

  /**
   * Renova o par de tokens. `shareReplay` garante single-flight: N requests
   * que caíram em 401 ao mesmo tempo compartilham UMA chamada de refresh —
   * essencial porque o backend rotaciona o refresh token (o segundo uso do
   * mesmo token seria 401 e derrubaria a sessão).
   */
  refresh(): Observable<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const token = this.refreshToken();
    if (!token) return of(false);

    this.refreshInFlight = this.api
      .post<AuthResponse>(
        'auth/refresh',
        { refreshToken: token },
        // Marcador removido pelo interceptor antes do envio: esta rota não pode
        // entrar no fluxo "401 → renova → repete" (loop infinito).
        new HttpHeaders({ [SKIP_AUTH_HEADER]: 'true' }),
      )
      .pipe(
        map((response) => {
          this.applyAuth(response);
          return true;
        }),
        catchError(() => of(false)),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshInFlight;
  }

  /** Logout: revoga o refresh token (melhor esforço) e limpa o estado local. */
  logout(options: { navigateToLogin?: boolean } = {}): void {
    const token = this.refreshToken();
    const finish = () => {
      this.clearSession();
      if (options.navigateToLogin) {
        void this.router.navigate(['/auth/login']);
      } else {
        void this.router.navigateByUrl(homePathForRole(null));
      }
    };

    if (!token) {
      finish();
      return;
    }

    this.api
      .postVoid('auth/logout', { refreshToken: token })
      .pipe(catchError(() => of(undefined)))
      .subscribe({ complete: finish, error: finish });
  }

  /** Sessão irrecuperável (refresh inválido/expirado) → volta pro login. */
  forceLogout(): void {
    this.clearSession();
    void this.router.navigate(['/auth/login'], { queryParams: { expired: '1' } });
  }

  private clearSession(): void {
    this.user.set(null);
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.ownCompany.set(null);
    this.ownCompanyId.set(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COMPANY_KEY);
  }

  // -------------------------------------------------------------------------
  // Empresa do recrutador
  // -------------------------------------------------------------------------

  /**
   * Registra o id da empresa descoberto em alguma resposta (vagas, stats) e
   * resolve `GET /companies/:id` uma única vez por sessão.
   */
  adoptCompanyId(companyId: number | null): void {
    const user = this.user();
    if (!user || user.role !== 'RECRUITER' || !companyId) return;
    if (this.ownCompanyId() === companyId && this.ownCompany()) return;

    this.ownCompanyId.set(companyId);
    try {
      localStorage.setItem(COMPANY_KEY, JSON.stringify({ userId: user.id, companyId }));
    } catch {
      /* ignorado: é só um cache de conveniência */
    }

    this.api
      .get<Company>(`companies/${companyId}`)
      .pipe(catchError(() => of(null)))
      .subscribe((company) => {
        if (company) this.ownCompany.set(company);
      });
  }

  /** Empresa do recrutador (ou `null` para ADMIN/CANDIDATE/sem empresa). */
  ownCompanyOnce(): Observable<Company | null> {
    const company = this.ownCompany();
    if (company) return of(company);
    const companyId = this.ownCompanyId();
    if (!companyId) return of(null);
    return this.api.get<Company>(`companies/${companyId}`).pipe(
      tap((resolved) => this.ownCompany.set(resolved)),
      catchError(() => of(null)),
    );
  }
}

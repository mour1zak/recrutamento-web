import { Component } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { apiKeyInterceptor } from '../http/api-key.interceptor';
import { authInterceptor } from '../http/auth.interceptor';

/**
 * Interceptors de HTTP — as duas camadas de autenticação do backend.
 *
 * Contrato coberto aqui:
 * 1. `x-api-key` em TODA chamada para a API (inclusive login/register/refresh,
 *    que são rotas "públicas" mas exigem a chave);
 * 2. `Authorization: Bearer <token>` quando há sessão;
 * 3. `401` → renovação automática via `POST /auth/refresh` + repetição do
 *    request original UMA vez;
 * 4. renovação falhou → sessão limpa + redirecionamento para `/auth/login`;
 * 5. single-flight: dois 401 simultâneos disparam apenas UM refresh (o backend
 *    rotaciona o token — renovar duas vezes invalidaria a sessão).
 */
describe('Interceptors de autenticação', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: AuthService;

  const session = {
    user: { id: 1, name: 'Candidato Um', email: 'candidato@recrutamento.test', role: 'CANDIDATE' },
    accessToken: 'access-antigo',
    refreshToken: 'refresh-1',
  };

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('recrutamento.session', JSON.stringify(session));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'auth/login', component: DummyComponent },
          { path: 'jobs', component: DummyComponent },
        ]),
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    controller.verify();
    sessionStorage.clear();
  });

  it('restaura a sessão persistida em sessionStorage', () => {
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.role).toBe('CANDIDATE');
    expect(auth.accessToken()).toBe('access-antigo');
  });

  it('anexa x-api-key e Bearer em chamada autenticada', () => {
    http.get(`${environment.apiUrl}/applications/me`).subscribe();

    const request = controller.expectOne(`${environment.apiUrl}/applications/me`);
    expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-antigo');
    request.flush({ data: [], page: 1, limit: 20, total: 0 });
  });

  it('anexa x-api-key em rota pública de auth, mas nunca o Bearer', () => {
    http.post(`${environment.apiUrl}/auth/login`, { email: 'a@b.co', password: 'x' }).subscribe();

    const request = controller.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ user: session.user, accessToken: 'novo', refreshToken: 'novo-refresh' });
  });

  it('não anexa Bearer em rota pública sem JWT (GET /cep/:cep)', () => {
    http.get(`${environment.apiUrl}/cep/01310-100`).subscribe();

    const request = controller.expectOne(`${environment.apiUrl}/cep/01310-100`);
    expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ street: 'Av. Paulista', city: 'São Paulo', state: 'SP' });
  });

  it('não vaza a API key para outro host', () => {
    http.get('https://exemplo.com.br/recurso').subscribe();

    const request = controller.expectOne('https://exemplo.com.br/recurso');
    expect(request.request.headers.has('x-api-key')).toBe(false);
    request.flush({});
  });

  it('vitrine pública (GET /jobs) leva só a API key', () => {
    http.get(`${environment.apiUrl}/jobs`).subscribe();

    const request = controller.expectOne(`${environment.apiUrl}/jobs`);
    expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: [], page: 1, limit: 10, total: 0 });
  });

  it('401 → renova o token e repete o request original uma vez', () => {
    const seen: unknown[] = [];
    http.get<{ data: unknown[] }>(`${environment.apiUrl}/applications/me`).subscribe({
      next: (value) => seen.push(value),
      error: () => seen.push('erro'),
    });

    // 1) request original com token expirado
    controller
      .expectOne(`${environment.apiUrl}/applications/me`)
      .flush(
        { statusCode: 401, error: 'Unauthorized', message: 'JWT expirado.' },
        { status: 401, statusText: 'Unauthorized' },
      );

    // 2) renovação (rotação de refresh token)
    const refreshRequest = controller.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(refreshRequest.request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(refreshRequest.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(refreshRequest.request.headers.has('Authorization')).toBe(false);
    refreshRequest.flush({
      user: session.user,
      accessToken: 'access-novo',
      refreshToken: 'refresh-2',
    });

    // 3) request original repetido, agora com o token novo
    const retry = controller.expectOne(`${environment.apiUrl}/applications/me`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-novo');
    retry.flush({ data: [1], page: 1, limit: 20, total: 1 });

    expect(seen).toEqual([{ data: [1], page: 1, limit: 20, total: 1 }]);
    expect(auth.accessToken()).toBe('access-novo');
    expect(auth.refreshToken()).toBe('refresh-2');
  });

  it('dois 401 simultâneos disparam apenas UMA renovação (single-flight)', () => {
    http.get(`${environment.apiUrl}/applications/me`).subscribe();
    http.get(`${environment.apiUrl}/documents/me`).subscribe();

    controller
      .expectOne(`${environment.apiUrl}/applications/me`)
      .flush({ statusCode: 401, message: 'expirado' }, { status: 401, statusText: 'Unauthorized' });
    controller
      .expectOne(`${environment.apiUrl}/documents/me`)
      .flush({ statusCode: 401, message: 'expirado' }, { status: 401, statusText: 'Unauthorized' });

    const refreshRequests = controller.match(`${environment.apiUrl}/auth/refresh`);
    expect(refreshRequests.length).toBe(1);

    refreshRequests[0].flush({ user: session.user, accessToken: 'access-novo', refreshToken: 'refresh-2' });

    controller.match(`${environment.apiUrl}/applications/me`).forEach((request) => request.flush({ ok: true }));
    controller.match(`${environment.apiUrl}/documents/me`).forEach((request) => request.flush([]));
  });

  it('refresh inválido → limpa a sessão e manda para /auth/login?expired=1', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/jobs');

    let receivedError: unknown = null;
    http.get(`${environment.apiUrl}/applications/me`).subscribe({ error: (error) => (receivedError = error) });

    controller
      .expectOne(`${environment.apiUrl}/applications/me`)
      .flush({ statusCode: 401, message: 'expirado' }, { status: 401, statusText: 'Unauthorized' });

    controller
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ statusCode: 401, message: 'refresh inválido' }, { status: 401, statusText: 'Unauthorized' });

    // Dá tempo da navegação disparada pelo forceLogout() resolver.
    TestBed.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.flushEffects();

    expect(receivedError).toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('recrutamento.session')).toBeNull();
    expect(router.url).toContain('/auth/login');
    expect(router.url).toContain('expired=1');
  });

  it('logout revoga o refresh token no backend e limpa o estado local', () => {
    auth.logout({ navigateToLogin: true });

    const request = controller.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });

    TestBed.flushEffects();

    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem('recrutamento.session')).toBeNull();
  });

  it('401 por API key inválida não derruba a sessão do usuário', () => {
    http.get(`${environment.apiUrl}/jobs`).subscribe({ error: () => undefined });

    controller
      .expectOne(`${environment.apiUrl}/jobs`)
      .flush(
        { statusCode: 401, error: 'Unauthorized', message: 'API key ausente ou inválida.' },
        { status: 401, statusText: 'Unauthorized' },
      );

    TestBed.flushEffects();

    expect(auth.isAuthenticated()).toBe(true);
    // Nenhum refresh foi tentado por causa desse 401.
    expect(controller.match(`${environment.apiUrl}/auth/refresh`).length).toBe(0);
  });
});

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

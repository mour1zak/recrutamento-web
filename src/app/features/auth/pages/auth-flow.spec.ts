import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { apiKeyInterceptor } from '../../../core/http/api-key.interceptor';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { LoginPageComponent } from './login';
import { RegisterPageComponent } from './register';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

const url = (path: string) => `${environment.apiUrl}/${path}`;

const ROUTES = [
  { path: 'auth/login', component: LoginPageComponent },
  { path: 'auth/register', component: RegisterPageComponent },
  { path: 'jobs', component: StubComponent },
  { path: 'candidate/profile', component: StubComponent },
  { path: 'recruiter', component: StubComponent },
  { path: 'admin', component: StubComponent },
];

function setValue(fixture: { nativeElement: HTMLElement }, selector: string, value: string): void {
  const element = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
  element.value = value;
  element.dispatchEvent(new Event('input'));
  element.dispatchEvent(new Event('blur'));
}

function clickSubmit(fixture: { nativeElement: HTMLElement }): void {
  (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
}

function textOf(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent as string;
}

/** Espera as navegações/microtasks pendentes do Router assentarem. */
async function settle(): Promise<void> {
  TestBed.flushEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.flushEffects();
}

/**
 * Passo 1 do roteiro de apresentação: cadastro → login.
 *
 * Os testes atravessam componente → service → interceptors → request HTTP e
 * conferem o corpo/cabeçalhos que sairiam para o backend real, além do
 * redirecionamento por papel depois do login.
 */
describe('Fluxo de autenticação (telas de login e cadastro)', () => {
  let controller: HttpTestingController;
  let router: Router;
  let auth: AuthService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter(ROUTES),
      ],
    });

    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('login de candidato: corpo correto, x-api-key presente, sessão guardada e destino /jobs', async () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#email', 'candidato@recrutamento.test');
    setValue(fixture, '#password', 'Senha@123');
    clickSubmit(fixture);

    const request = controller.expectOne(url('auth/login'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'candidato@recrutamento.test', password: 'Senha@123' });
    expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(request.request.headers.has('Authorization')).toBe(false);

    request.flush({
      user: { id: 3, name: 'Candidato Um', email: 'candidato@recrutamento.test', role: 'CANDIDATE' },
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    await settle();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.role()).toBe('CANDIDATE');
    expect(JSON.parse(sessionStorage.getItem('recrutamento.session') ?? 'null').accessToken).toBe('access');
    expect(router.url).toBe('/jobs');
  });

  it('login de recrutador cai no painel e login de admin cai na administração', async () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#email', 'recrutador@recrutamento.test');
    setValue(fixture, '#password', 'Senha@123');
    clickSubmit(fixture);
    controller.expectOne(url('auth/login')).flush({
      user: { id: 2, name: 'Recrutador Um', email: 'recrutador@recrutamento.test', role: 'RECRUITER' },
      accessToken: 'a2',
      refreshToken: 'r2',
    });
    await settle();
    expect(router.url).toBe('/recruiter');

    sessionStorage.clear();
    const adminFixture = TestBed.createComponent(LoginPageComponent);
    adminFixture.autoDetectChanges();
    setValue(adminFixture, '#email', 'admin@recrutamento.test');
    setValue(adminFixture, '#password', 'Senha@123');
    clickSubmit(adminFixture);
    controller.expectOne(url('auth/login')).flush({
      user: { id: 1, name: 'Admin Geral', email: 'admin@recrutamento.test', role: 'ADMIN' },
      accessToken: 'a1',
      refreshToken: 'r1',
    });
    await settle();
    expect(router.url).toBe('/admin');
  });

  it('credenciais inválidas (401) mostram "Email ou senha inválidos" e não criam sessão', async () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#email', 'candidato@recrutamento.test');
    setValue(fixture, '#password', 'senha-errada');
    clickSubmit(fixture);

    controller
      .expectOne(url('auth/login'))
      .flush(
        { statusCode: 401, error: 'Unauthorized', message: 'Credenciais inválidas.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle();

    expect(textOf(fixture)).toContain('Email ou senha inválidos');
    expect(sessionStorage.getItem('recrutamento.session')).toBeNull();
  });

  it('login em branco não chama a API (validação no cliente)', async () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.autoDetectChanges();

    clickSubmit(fixture);
    await settle();

    expect(controller.match(() => true)).toHaveLength(0);
    expect(textOf(fixture)).toContain('Campo obrigatório');
  });

  it('?expired=1 mostra o aviso de sessão expirada', async () => {
    await router.navigateByUrl('/auth/login?expired=1');
    await settle();
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.autoDetectChanges();
    await settle();

    expect(textOf(fixture)).toContain('Sua sessão expirou');
  });

  it('cadastro aplica as regras do RegisterDto antes de bater na API', async () => {
    await router.navigateByUrl('/auth/register');
    const fixture = TestBed.createComponent(RegisterPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#name', 'Maria Silva');
    setValue(fixture, '#email', 'maria@example.com');
    setValue(fixture, '#password', '123');
    setValue(fixture, '#confirmPassword', '123');
    clickSubmit(fixture);
    await settle();

    expect(controller.match(() => true)).toHaveLength(0);
    expect(textOf(fixture)).toContain('Mínimo de 8 caracteres');

    setValue(fixture, '#password', 'SenhaForte@123');
    setValue(fixture, '#confirmPassword', 'SenhaForte@12');
    clickSubmit(fixture);
    await settle();
    expect(textOf(fixture)).toContain('As senhas não coincidem');
    expect(controller.match(() => true)).toHaveLength(0);
  });

  it('cadastro válido cria a conta, já entra logado e leva para completar o perfil', async () => {
    await router.navigateByUrl('/auth/register');
    const fixture = TestBed.createComponent(RegisterPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#name', 'Maria Silva');
    setValue(fixture, '#email', 'maria@example.com');
    setValue(fixture, '#password', 'SenhaForte@123');
    setValue(fixture, '#confirmPassword', 'SenhaForte@123');
    clickSubmit(fixture);

    const request = controller.expectOne(url('auth/register'));
    expect(request.request.body).toEqual({
      name: 'Maria Silva',
      email: 'maria@example.com',
      password: 'SenhaForte@123',
    });
    request.flush({
      user: { id: 9, name: 'Maria Silva', email: 'maria@example.com', role: 'CANDIDATE' },
      accessToken: 'access-9',
      refreshToken: 'refresh-9',
    });
    await settle();

    expect(auth.isAuthenticated()).toBe(true);
    expect(router.url).toContain('/candidate/profile');
    expect(router.url).toContain('new=1');
  });

  it('email já cadastrado (409) orienta usar o login', async () => {
    await router.navigateByUrl('/auth/register');
    const fixture = TestBed.createComponent(RegisterPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#name', 'Maria Silva');
    setValue(fixture, '#email', 'maria@example.com');
    setValue(fixture, '#password', 'SenhaForte@123');
    setValue(fixture, '#confirmPassword', 'SenhaForte@123');
    clickSubmit(fixture);

    controller
      .expectOne(url('auth/register'))
      .flush(
        { statusCode: 409, error: 'Conflict', message: 'Email já cadastrado.' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(textOf(fixture)).toContain('Este email já está cadastrado');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('erro de validação do backend (400) lista os campos na tela', async () => {
    await router.navigateByUrl('/auth/register');
    const fixture = TestBed.createComponent(RegisterPageComponent);
    fixture.autoDetectChanges();

    setValue(fixture, '#name', 'Maria Silva');
    setValue(fixture, '#email', 'maria@example.com');
    setValue(fixture, '#password', 'SenhaForte@123');
    setValue(fixture, '#confirmPassword', 'SenhaForte@123');
    clickSubmit(fixture);

    controller
      .expectOne(url('auth/register'))
      .flush(
        { statusCode: 400, error: 'Bad Request', message: ['email must be an email'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(textOf(fixture)).toContain('Confira os dados do formulário');
    expect(textOf(fixture)).toContain('email must be an email');
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authGuard, guestGuard, permissionGuard, readReturnUrl, roleGuard } from './auth.guards';
import { PERMISSIONS, PermissionsService } from '../auth/permissions.service';
import { homePathForRole } from '../auth/auth.service';

@Component({ selector: 'app-blank', template: '' })
class BlankComponent {}

const CANDIDATE_SESSION = {
  user: { id: 3, name: 'Candidato Um', email: 'candidato@recrutamento.test', role: 'CANDIDATE' },
  accessToken: 'a',
  refreshToken: 'r',
};

const RECRUITER_SESSION = {
  user: { id: 2, name: 'Recrutador Um', email: 'recrutador@recrutamento.test', role: 'RECRUITER' },
  accessToken: 'a',
  refreshToken: 'r',
};

const ADMIN_SESSION = {
  user: { id: 1, name: 'Admin Geral', email: 'admin@recrutamento.test', role: 'ADMIN' },
  accessToken: 'a',
  refreshToken: 'r',
};

/** Os guards só leem `router.url`/`getCurrentNavigation()`, nunca o snapshot. */
const fakeSnapshot = {} as unknown as ActivatedRouteSnapshot;
const fakeState = {} as never;

function loginAs(session: unknown): void {
  sessionStorage.clear();
  sessionStorage.setItem('recrutamento.session', JSON.stringify(session));
}

/**
 * Guards + espelho client-side do RBAC.
 *
 * Objetivo destes testes: o pedido do briefing de que um `403` idealmente nem
 * aconteça — a UI não oferece a ação que o backend negaria. Por isso as
 * permissões conferidas aqui são exatamente as do seed do backend
 * (CANDIDATE 8 keys, RECRUITER 13, ADMIN 24).
 */
describe('Guards de rota', () => {
  let router: Router;

  beforeEach(async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/login', component: BlankComponent },
          { path: 'jobs', component: BlankComponent },
          { path: 'candidate/applications', component: BlankComponent },
          { path: 'recruiter', component: BlankComponent },
          { path: 'admin', component: BlankComponent },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/candidate/applications');
  });

  afterEach(() => sessionStorage.clear());

  it('authGuard manda visitante para o login guardando o returnUrl', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(fakeSnapshot, fakeState));
    expect(String(result)).toBe('/auth/login?returnUrl=%2Fcandidate%2Fapplications');
  });

  it('authGuard libera quem tem sessão', () => {
    loginAs(CANDIDATE_SESSION);
    const result = TestBed.runInInjectionContext(() => authGuard(fakeSnapshot, fakeState));
    expect(result).toBe(true);
  });

  it('roleGuard bloqueia candidato na área do recrutador e devolve para a home dele', () => {
    loginAs(CANDIDATE_SESSION);
    const result = TestBed.runInInjectionContext(() => roleGuard('RECRUITER', 'ADMIN')(fakeSnapshot, fakeState));
    expect(String(result)).toBe('/jobs');
  });

  it('roleGuard libera recrutador e admin na área do recrutador', () => {
    loginAs(RECRUITER_SESSION);
    expect(TestBed.runInInjectionContext(() => roleGuard('RECRUITER', 'ADMIN')(fakeSnapshot, fakeState))).toBe(true);

    loginAs(ADMIN_SESSION);
    expect(TestBed.runInInjectionContext(() => roleGuard('RECRUITER', 'ADMIN')(fakeSnapshot, fakeState))).toBe(true);
  });

  it('roleGuard sem sessão também cai no login', () => {
    const result = TestBed.runInInjectionContext(() => roleGuard('ADMIN')(fakeSnapshot, fakeState));
    expect(String(result)).toContain('/auth/login');
  });

  it('guestGuard tira do login quem já está logado', () => {
    loginAs(ADMIN_SESSION);
    const result = TestBed.runInInjectionContext(() => guestGuard(fakeSnapshot, fakeState));
    expect(String(result)).toBe('/admin');
  });

  it('permissionGuard usa a permission key (candidato não entra em área de user:read)', () => {
    loginAs(CANDIDATE_SESSION);
    const result = TestBed.runInInjectionContext(() => permissionGuard(PERMISSIONS.USER_READ)(fakeSnapshot, fakeState));
    expect(String(result)).toBe('/jobs');
  });

  it('permissionGuard libera admin para user:read', () => {
    loginAs(ADMIN_SESSION);
    const result = TestBed.runInInjectionContext(() => permissionGuard(PERMISSIONS.USER_READ)(fakeSnapshot, fakeState));
    expect(result).toBe(true);
  });

  it('readReturnUrl rejeita redirecionamento externo (open redirect)', () => {
    expect(readReturnUrl({ returnUrl: '/candidate/profile' }, '/jobs')).toBe('/candidate/profile');
    expect(readReturnUrl({ returnUrl: 'https://evil.example.com' }, '/jobs')).toBe('/jobs');
    expect(readReturnUrl({ returnUrl: '//evil.example.com' }, '/jobs')).toBe('/jobs');
    expect(readReturnUrl({ returnUrl: '' }, '/jobs')).toBe('/jobs');
    expect(readReturnUrl({}, '/jobs')).toBe('/jobs');
  });

  it('home por papel: candidato → vagas, recrutador → painel, admin → administração', () => {
    expect(homePathForRole('CANDIDATE')).toBe('/jobs');
    expect(homePathForRole('RECRUITER')).toBe('/recruiter');
    expect(homePathForRole('ADMIN')).toBe('/admin');
    expect(homePathForRole(null)).toBe('/jobs');
  });
});

describe('PermissionsService — espelho do RBAC do backend', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  function permissionsFor(session: unknown): PermissionsService {
    if (session) {
      sessionStorage.setItem('recrutamento.session', JSON.stringify(session));
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    return TestBed.inject(PermissionsService);
  }

  it('visitante não pode nada', () => {
    const permissions = permissionsFor(null);
    expect(permissions.permissions()).toEqual([]);
    expect(permissions.can(PERMISSIONS.JOB_READ)).toBe(false);
  });

  it('CANDIDATE: cria candidatura, desiste, sobe currículo; não cria vaga nem avalia', () => {
    const permissions = permissionsFor(CANDIDATE_SESSION);
    expect(permissions.can(PERMISSIONS.APPLICATION_CREATE)).toBe(true);
    expect(permissions.can(PERMISSIONS.APPLICATION_WITHDRAW_OWN)).toBe(true);
    expect(permissions.can(PERMISSIONS.DOCUMENT_UPLOAD_OWN)).toBe(true);
    expect(permissions.can(PERMISSIONS.CANDIDATE_PROFILE_UPDATE_OWN)).toBe(true);

    expect(permissions.can(PERMISSIONS.JOB_CREATE)).toBe(false);
    expect(permissions.can(PERMISSIONS.APPLICATION_STATUS_UPDATE)).toBe(false);
    expect(permissions.can(PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(permissions.permissions()).toHaveLength(8);
  });

  it('RECRUITER: cria/gerencia vagas e candidaturas, agenda entrevista; não se candidata', () => {
    const permissions = permissionsFor(RECRUITER_SESSION);
    expect(permissions.can(PERMISSIONS.JOB_CREATE)).toBe(true);
    expect(permissions.can(PERMISSIONS.JOB_STATUS_UPDATE)).toBe(true);
    expect(permissions.can(PERMISSIONS.APPLICATION_READ_JOB)).toBe(true);
    expect(permissions.can(PERMISSIONS.APPLICATION_STATUS_UPDATE)).toBe(true);
    expect(permissions.can(PERMISSIONS.INTERVIEW_CREATE)).toBe(true);
    expect(permissions.can(PERMISSIONS.DOCUMENT_READ_APPLICATION)).toBe(true);

    expect(permissions.can(PERMISSIONS.APPLICATION_CREATE)).toBe(false);
    expect(permissions.can(PERMISSIONS.DOCUMENT_UPLOAD_OWN)).toBe(false);
    expect(permissions.can(PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(permissions.permissions()).toHaveLength(13);
  });

  it('ADMIN: gestão de usuários/papéis/empresas, menos as 4 keys exclusivas de candidato', () => {
    const permissions = permissionsFor(ADMIN_SESSION);
    expect(permissions.can(PERMISSIONS.USER_MANAGE)).toBe(true);
    expect(permissions.can(PERMISSIONS.ROLE_MANAGE)).toBe(true);
    expect(permissions.can(PERMISSIONS.COMPANY_CREATE)).toBe(true);
    expect(permissions.can(PERMISSIONS.COMPANY_DELETE)).toBe(true);
    expect(permissions.can(PERMISSIONS.APPLICATION_READ_ANY)).toBe(true);

    expect(permissions.can(PERMISSIONS.APPLICATION_CREATE)).toBe(false);
    expect(permissions.can(PERMISSIONS.APPLICATION_WITHDRAW_OWN)).toBe(false);
    expect(permissions.can(PERMISSIONS.CANDIDATE_PROFILE_UPDATE_OWN)).toBe(false);
    expect(permissions.can(PERMISSIONS.DOCUMENT_UPLOAD_OWN)).toBe(false);
    expect(permissions.permissions()).toHaveLength(24);
  });

  it('papel custom (RBAC dinâmico) não recebe permissões no cliente — a UI esconde e o backend decide', () => {
    const permissions = permissionsFor({
      user: { id: 9, name: 'Custom', email: 'c@x.co', role: 'SUPPORT' },
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(permissions.permissions()).toEqual([]);
    expect(permissions.can(PERMISSIONS.USER_READ)).toBe(false);
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LandingPageComponent } from './landing-page';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

async function settle(): Promise<void> {
  TestBed.flushEffects();
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.flushEffects();
}

/**
 * Porta de entrada estilo portal: visitante vê a landing com CTAs de entrada;
 * quem já tem sessão cai direto na home do próprio papel.
 */
describe('Landing + gate de conteúdo', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: LandingPageComponent },
          { path: 'jobs', component: StubComponent },
          { path: 'auth/login', component: StubComponent },
          { path: 'auth/register', component: StubComponent },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  it('visitante vê a proposta do produto e os caminhos de entrada', async () => {
    await router.navigateByUrl('/');
    await settle();
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.autoDetectChanges();
    await settle();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Criar conta gratuita');
    expect(text).toContain('Já tenho conta');
    expect(text).toContain('entre ou crie a');
    // sem WebGL (jsdom), o painel degrada para o mock estático — nunca vazio
    expect(text).toContain('Contratado');
    // Nada de dado inventado: a landing não exibe números/statísticas.
    expect(text).not.toMatch(/\d\.\d{3}\s*candidat/i);
  });

  it('vitrine agora exige sessão (guard da rota /jobs)', async () => {
    // Sem sessão, o authGuard (aplicado em app.routes) manda pro login com returnUrl.
    localStorage.clear();
    const { authGuard } = await import('../../core/guards/auth.guards');
    await router.navigateByUrl('/jobs');
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(String(result)).toBe('/auth/login?returnUrl=%2Fjobs');
  });

  it('candidato logado que abre a raiz vai para a vitrine, não para a landing', async () => {
    localStorage.setItem(
      'recrutamento.session',
      JSON.stringify({
        user: { id: 3, name: 'Candidato Um', email: 'c@x.co', role: 'CANDIDATE' },
        accessToken: 'a',
        refreshToken: 'r',
      }),
    );
    const { homeIfAuthedGuard } = await import('../../core/guards/auth.guards');
    const result = TestBed.runInInjectionContext(() => homeIfAuthedGuard({} as never, {} as never));
    expect(String(result)).toBe('/jobs');
  });
});

import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { apiKeyInterceptor } from '../../../core/http/api-key.interceptor';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { JobsPageComponent } from './jobs-page';
import { JobDetailPageComponent } from './job-detail-page';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

@Component({
  selector: 'app-outlet-host',
  imports: [RouterOutlet],
  template: `<div id="root-host"><router-outlet /></div>`,
})
class OutletHostComponent {}

type HostFixture = ComponentFixture<OutletHostComponent>;

const url = (path: string) => `${environment.apiUrl}/${path}`;

const PUBLIC_JOB = {
  id: 7,
  title: 'Desenvolvedor(a) Backend Node.js',
  description: 'Vaga remota, foco em NestJS e PostgreSQL.',
  isRemote: true,
  salaryMin: 9000,
  salaryMax: 14000,
  vacancies: 2,
  status: 'OPEN',
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  closedAt: null,
  company: { id: 1, name: 'Tech Solutions Ltda' },
};

const SCOPED_JOB = { ...PUBLIC_JOB, companyId: 1, createdById: 2, filledCount: 0 };

function candidateSession(): void {
  localStorage.setItem(
    'recrutamento.session',
    JSON.stringify({
      user: { id: 3, name: 'Candidato Um', email: 'candidato@recrutamento.test', role: 'CANDIDATE' },
      accessToken: 'token-candidato',
      refreshToken: 'refresh-candidato',
    }),
  );
}

/** Deixa navegações do Router e efeitos de signals assentarem. */
async function settle(rounds = 3): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    TestBed.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.flushEffects();
}

function textOf(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent as string;
}

function clickByText(fixture: { nativeElement: HTMLElement }, label: string): void {
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (element: HTMLButtonElement) => element.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Botão "${label}" não encontrado na tela.`);
  button.click();
}

/**
 * Roteiro de apresentação, passo 1 (candidato): listar vagas → abrir a vaga →
 * candidatar-se → ver o status.
 *
 * Nada de dado inventado: tudo que aparece na tela vem dos `flush()` abaixo, que
 * reproduzem o envelope real do backend (`{data, page, limit, total}`).
 */
describe('Fluxo do candidato — vitrine, detalhe e candidatura', () => {
  let controller: HttpTestingController;
  let router: Router;
  let host: HostFixture;

  /** Navega de verdade (com parâmetro de rota) e devolve o host com o outlet. */
  async function render(path: string) {
    host = TestBed.createComponent(OutletHostComponent);
    host.autoDetectChanges();
    await router.navigateByUrl(path);
    await settle();
    return host;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'jobs', component: JobsPageComponent },
          { path: 'jobs/:id', component: JobDetailPageComponent },
          { path: 'auth/login', component: StubComponent },
          { path: 'auth/register', component: StubComponent },
          { path: 'candidate/applications/:id', component: StubComponent },
          { path: 'candidate/profile', component: StubComponent },
        ]),
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('vitrine pública lista as vagas abertas sem exigir login', async () => {
    await render('/jobs');

    const request = controller.expectOne(url('jobs?page=1&limit=10&sortOrder=desc'));
    expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: [PUBLIC_JOB], page: 1, limit: 10, total: 1 });
    await settle();

    const text = textOf(host);
    expect(text).toContain('Desenvolvedor(a) Backend Node.js');
    expect(text).toContain('Tech Solutions Ltda');
    expect(text).toContain('Remota');
    expect(text).toContain('1 vaga(s) aberta(s)');
    expect(text).toContain('2 vaga(s)');
  });

  it('busca da vitrine vai como ?search para o backend', async () => {
    await render('/jobs');
    controller.expectOne(url('jobs?page=1&limit=10&sortOrder=desc')).flush({ data: [], page: 1, limit: 10, total: 0 });
    await settle();

    const searchInput = host.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    searchInput.value = 'nest';
    (host.nativeElement.querySelector('.hero__search button[type="submit"]') as HTMLButtonElement).click();
    await settle();

    const searchRequest = controller.expectOne(url('jobs?page=1&limit=10&search=nest&sortOrder=desc'));
    expect(searchRequest.request.params.get('search')).toBe('nest');
    searchRequest.flush({ data: [PUBLIC_JOB], page: 1, limit: 10, total: 1 });
    await settle();

    expect(textOf(host)).toContain('1 vaga(s) aberta(s) para "nest"');
  });

  it('ordenação "Mais relevantes" ranqueia título que contém a busca', async () => {
    await render('/jobs');
    controller.expectOne(url('jobs?page=1&limit=10&sortOrder=desc')).flush({ data: [], page: 1, limit: 10, total: 0 });
    await settle();

    const searchInput = host.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    searchInput.value = 'nest';
    (host.nativeElement.querySelector('.hero__search button[type="submit"]') as HTMLButtonElement).click();
    await settle();

    // descrição menciona "nest" no primeiro item; título só no segundo
    controller.expectOne(url('jobs?page=1&limit=10&search=nest&sortOrder=desc')).flush({
      data: [
        { ...PUBLIC_JOB, id: 1, title: 'Pessoa desenvolvedora', description: 'Usa nest no dia a dia.' },
        { ...PUBLIC_JOB, id: 2, title: 'Especialista NestJS', description: 'Backend geral.' },
      ],
      page: 1,
      limit: 10,
      total: 2,
    });
    await settle();

    const sortSelect = host.nativeElement.querySelector('.hero__sort select') as HTMLSelectElement;
    sortSelect.value = 'relevancia';
    sortSelect.dispatchEvent(new Event('change'));
    await settle();

    // sem nova chamada: o ranking é de cliente sobre a página atual
    const titles = [...host.nativeElement.querySelectorAll('.job-card__title')].map((element) =>
      element.textContent?.trim(),
    );
    expect(titles[0]).toBe('Especialista NestJS');
  });

  it('sem vagas abertas a vitrine mostra estado vazio (nunca dado falso)', async () => {
    await render('/jobs');
    controller.expectOne(url('jobs?page=1&limit=10&sortOrder=desc')).flush({ data: [], page: 1, limit: 10, total: 0 });
    await settle();

    expect(textOf(host)).toContain('Nenhuma vaga aberta com esses filtros');
  });

  it('API fora do ar mostra erro acionável em vez de tela em branco', async () => {
    await render('/jobs');
    controller.expectOne(url('jobs?page=1&limit=10&sortOrder=desc')).error(new ProgressEvent('error'));
    await settle();

    expect(textOf(host)).toContain('Não foi possível falar com a API');
  });

  it('visitante que abre a vaga resolve pela listagem pública e é convidado a entrar', async () => {
    await render('/jobs/7');

    // Sem sessão: GET /jobs/:id não é chamado (exigiria JWT) — usa a vitrine.
    const publicRequest = controller.expectOne(url('jobs?page=1&limit=100'));
    expect(publicRequest.request.headers.has('Authorization')).toBe(false);
    publicRequest.flush({ data: [PUBLIC_JOB], page: 1, limit: 100, total: 1 });
    await settle();

    const text = textOf(host);
    expect(text).toContain('Desenvolvedor(a) Backend Node.js');
    expect(text).toContain('Tech Solutions Ltda');
    expect(text).toContain('Entrar para se candidatar');
    expect(text).toContain('Criar conta gratuita');
  });

  it('vaga inexistente mostra "Vaga não encontrada" (404 nunca vira "sem permissão")', async () => {
    candidateSession();
    await render('/jobs/999');

    controller
      .expectOne(url('jobs/999'))
      .flush(
        { statusCode: 404, error: 'Not Found', reason: 'job_not_found', message: 'Vaga não encontrada.' },
        { status: 404, statusText: 'Not Found' },
      );
    controller.expectOne(url('jobs?page=1&limit=100')).flush({ data: [], page: 1, limit: 100, total: 0 });
    await settle();

    expect(textOf(host)).toContain('Vaga não encontrada');
    expect(textOf(host).toLowerCase()).not.toContain('permiss');
  });

  it('candidato logado se candidata: POST /jobs/:id/applications com carta e currículo', async () => {
    candidateSession();
    await render('/jobs/7');

    controller.expectOne(url('jobs/7')).flush(SCOPED_JOB);
    controller.expectOne(url('applications/me?page=1&limit=100')).flush({ data: [], page: 1, limit: 100, total: 0 });
    controller.expectOne(url('documents/me')).flush([
      {
        id: 11,
        type: 'RESUME',
        filename: 'curriculo.pdf',
        originalName: 'curriculo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20480,
        createdAt: '2026-09-02T10:00:00.000Z',
      },
    ]);
    await settle();

    expect(textOf(host)).toContain('Candidatar-se');
    clickByText(host, 'Candidatar-se');
    await settle();

    const textarea = host.nativeElement.querySelector('#coverLetter') as HTMLTextAreaElement;
    textarea.value = 'Tenho 3 anos de experiência com Node.js e NestJS.';
    textarea.dispatchEvent(new Event('input'));
    await settle();

    const resumeSelect = host.nativeElement.querySelector('#resume') as HTMLSelectElement;
    expect(resumeSelect).toBeTruthy();
    expect(resumeSelect.textContent).toContain('curriculo.pdf');

    (host.nativeElement.querySelector('.modal__footer button[type="submit"]') as HTMLButtonElement).click();

    const createRequest = controller.expectOne(url('jobs/7/applications'));
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.headers.get('Authorization')).toBe('Bearer token-candidato');
    expect(createRequest.request.body).toMatchObject({
      coverLetter: 'Tenho 3 anos de experiência com Node.js e NestJS.',
      resumeDocumentId: 11,
    });
    createRequest.flush({
      id: 42,
      jobId: 7,
      candidateId: 3,
      status: 'PENDING',
      coverLetter: 'Tenho 3 anos de experiência com Node.js e NestJS.',
      resumeDocumentId: 11,
      createdAt: '2026-09-27T12:00:00.000Z',
      updatedAt: '2026-09-27T12:00:00.000Z',
      job: { id: 7, title: PUBLIC_JOB.title, companyId: 1, status: 'OPEN', vacancies: 2, filledCount: 0 },
      candidate: { id: 3, name: 'Candidato Um' },
      resumeDocument: { id: 11, filename: 'curriculo.pdf', mimeType: 'application/pdf', sizeBytes: 20480 },
    });
    await settle();

    expect(router.url).toContain('/candidate/applications/42');
  });

  it('candidatura duplicada (409) mostra exatamente a mensagem pedida no briefing', async () => {
    candidateSession();
    await render('/jobs/7');

    controller.expectOne(url('jobs/7')).flush(SCOPED_JOB);
    controller.expectOne(url('applications/me?page=1&limit=100')).flush({ data: [], page: 1, limit: 100, total: 0 });
    controller.expectOne(url('documents/me')).flush([]);
    await settle();

    clickByText(host, 'Candidatar-se');
    await settle();
    (host.nativeElement.querySelector('.modal__footer button[type="submit"]') as HTMLButtonElement).click();

    controller
      .expectOne(url('jobs/7/applications'))
      .flush(
        { statusCode: 409, error: 'Conflict', reason: 'candidatura_duplicada', message: 'Já existe candidatura.' },
        { status: 409, statusText: 'Conflict' },
      );
    // a tela recarrega as candidaturas para refletir o estado real
    controller.expectOne(url('applications/me?page=1&limit=100')).flush({ data: [], page: 1, limit: 100, total: 0 });
    await settle();

    expect(textOf(host)).toContain('Você já se candidatou a esta vaga.');
  });

  it('quem já se candidatou vê o status e o atalho, não o botão de candidatar', async () => {
    candidateSession();
    await render('/jobs/7');

    controller.expectOne(url('jobs/7')).flush({ ...SCOPED_JOB, filledCount: 1 });
    controller.expectOne(url('applications/me?page=1&limit=100')).flush({
      data: [
        {
          id: 42,
          jobId: 7,
          candidateId: 3,
          status: 'UNDER_REVIEW',
          coverLetter: null,
          resumeDocumentId: null,
          createdAt: '2026-09-20T12:00:00.000Z',
          updatedAt: '2026-09-25T12:00:00.000Z',
          job: { id: 7, title: PUBLIC_JOB.title, companyId: 1, status: 'OPEN', vacancies: 2, filledCount: 1 },
          candidate: { id: 3, name: 'Candidato Um' },
          resumeDocument: null,
        },
      ],
      page: 1,
      limit: 100,
      total: 1,
    });
    controller.expectOne(url('documents/me')).flush([]);
    await settle();

    expect(textOf(host)).toContain('Você já se candidatou a esta vaga');
    expect(textOf(host)).toContain('Em avaliação');
    expect(textOf(host)).toContain('Ver minha candidatura');
    expect(textOf(host)).not.toContain('Candidatar-se');
  });

  it('recrutador que abre a própria vaga vê os atalhos de gestão, não o botão de candidatar', async () => {
    localStorage.setItem(
      'recrutamento.session',
      JSON.stringify({
        user: { id: 2, name: 'Recrutador Um', email: 'recrutador@recrutamento.test', role: 'RECRUITER' },
        accessToken: 'token-recrutador',
        refreshToken: 'refresh-recrutador',
      }),
    );
    await render('/jobs/7');

    controller.expectOne(url('jobs/7')).flush(SCOPED_JOB);
    await settle();

    expect(textOf(host)).toContain('Gestão desta vaga');
    expect(textOf(host)).toContain('Candidaturas');
    expect(textOf(host)).not.toContain('Candidatar-se');
  });
});

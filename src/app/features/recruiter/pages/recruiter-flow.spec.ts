import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { apiKeyInterceptor } from '../../../core/http/api-key.interceptor';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import type { Application, ApplicationFull } from '../../../core/models';
import { ApplicationReviewComponent } from '../components/application-review';
import { JobApplicationsPageComponent } from '../pages/job-applications-page';
import { MyJobsPageComponent } from '../pages/my-jobs-page';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

@Component({
  selector: 'app-outlet-host',
  imports: [RouterOutlet],
  template: `<div id="root-host"><router-outlet /></div>`,
})
class OutletHostComponent {}

const url = (path: string) => `${environment.apiUrl}/${path}`;

function recruiterSession(): void {
  sessionStorage.setItem(
    'recrutamento.session',
    JSON.stringify({
      user: { id: 2, name: 'Recrutador Um', email: 'recrutador@recrutamento.test', role: 'RECRUITER' },
      accessToken: 'token-recrutador',
      refreshToken: 'refresh-recrutador',
    }),
  );
}

const PENDING_APPLICATION: ApplicationFull = {
  id: 42,
  jobId: 7,
  candidateId: 3,
  status: 'PENDING',
  coverLetter: 'Tenho 3 anos de experiência com Node.js e NestJS.',
  resumeDocumentId: 11,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  job: { id: 7, title: 'Desenvolvedor(a) Backend Node.js', companyId: 1, status: 'OPEN', vacancies: 2, filledCount: 1 },
  candidate: { id: 3, name: 'Candidato Um' },
  resumeDocument: { id: 11, filename: 'curriculo.pdf', mimeType: 'application/pdf', sizeBytes: 20480 },
};

const SCOPED_JOB = {
  id: 7,
  title: 'Desenvolvedor(a) Backend Node.js',
  description: 'Vaga remota, foco em NestJS.',
  isRemote: true,
  salaryMin: 9000,
  salaryMax: 14000,
  vacancies: 2,
  status: 'OPEN',
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  closedAt: null,
  companyId: 1,
  createdById: 2,
  filledCount: 1,
  company: { id: 1, name: 'Tech Solutions Ltda' },
};

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

function buttons(fixture: { nativeElement: HTMLElement }): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
}

function clickButton(fixture: { nativeElement: HTMLElement }, label: string): void {
  const button = buttons(fixture).find((element) => element.textContent?.trim() === label);
  if (!button)
    throw new Error(
      `Botão "${label}" não encontrado. Botões: ${buttons(fixture)
        .map((b) => b.textContent?.trim())
        .join(' | ')}`,
    );
  button.click();
}

function clickButtonContaining(fixture: { nativeElement: HTMLElement }, label: string): void {
  const button = buttons(fixture).find((element) => element.textContent?.includes(label));
  if (!button) throw new Error(`Botão com "${label}" não encontrado.`);
  button.click();
}

/**
 * Roteiro de apresentação, passo 2 (recrutador): ver candidaturas → avaliar →
 * avançar status → agendar entrevista → baixar currículo.
 *
 * Os destinos oferecidos nos botões vêm da mesma tabela de transições do
 * backend, então a UI nunca provoca `400 invalid_status_transition`.
 */
describe('Fluxo do recrutador — avaliação de candidaturas', () => {
  let controller: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
    recruiterSession();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'recruiter/jobs', component: MyJobsPageComponent },
          { path: 'recruiter/jobs/:jobId', component: JobApplicationsPageComponent },
          { path: 'recruiter/jobs/:jobId/edit', component: StubComponent },
          { path: 'recruiter/applications/:id', component: StubComponent },
          { path: 'jobs/:id', component: StubComponent },
          { path: 'auth/login', component: StubComponent },
        ]),
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('painel de avaliação (ApplicationReviewComponent)', () => {
    let fixture: ComponentFixture<ApplicationReviewComponent>;

    async function render(application: Application, interviews: unknown[] = []): Promise<void> {
      fixture = TestBed.createComponent(ApplicationReviewComponent);
      fixture.componentRef.setInput('application', application);
      fixture.componentRef.setInput('interviews', interviews);
      fixture.autoDetectChanges();
      await settle();
    }

    it('candidatura PENDING oferece apenas "Em avaliação" e "Recusado"', async () => {
      await render(PENDING_APPLICATION);
      const text = textOf(fixture);
      expect(text).toContain('Mover no processo');
      expect(text).toContain('Em avaliação');
      expect(text).toContain('Recusado');
      expect(text).not.toContain('Contratado');
      expect(text).not.toContain('Proposta');
    });

    it('não oferece agendar entrevista fora do estágio INTERVIEW (regra do backend)', async () => {
      await render(PENDING_APPLICATION);
      expect(textOf(fixture)).toContain('Para agendar, mova a candidatura para o estágio "Entrevista"');
      expect(buttons(fixture).some((button) => button.textContent?.includes('Agendar entrevista'))).toBe(false);
    });

    it('avançar status: PATCH /applications/:id/status com Bearer e motivo opcional', async () => {
      await render(PENDING_APPLICATION);
      clickButton(fixture, 'Em avaliação');
      await settle();

      const textarea = fixture.nativeElement.querySelector('#reason') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      textarea.value = 'Perfil aderente ao stack.';
      textarea.dispatchEvent(new Event('input'));
      await settle();

      clickButton(fixture, 'Confirmar');

      const request = controller.expectOne(url('applications/42/status'));
      expect(request.request.method).toBe('PATCH');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-recrutador');
      expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
      expect(request.request.body).toEqual({ status: 'UNDER_REVIEW', reason: 'Perfil aderente ao stack.' });
      request.flush({ ...PENDING_APPLICATION, status: 'UNDER_REVIEW' });
      await settle();
    });

    it('recusar envia status REJECTED com o motivo da recusa', async () => {
      await render(PENDING_APPLICATION);
      clickButton(fixture, 'Recusado');
      await settle();

      const textarea = fixture.nativeElement.querySelector('#reason') as HTMLTextAreaElement;
      textarea.value = 'Fora do perfil técnico exigido.';
      textarea.dispatchEvent(new Event('input'));
      await settle();
      clickButton(fixture, 'Confirmar');

      const request = controller.expectOne(url('applications/42/status'));
      expect(request.request.body).toEqual({ status: 'REJECTED', reason: 'Fora do perfil técnico exigido.' });
      request.flush({ ...PENDING_APPLICATION, status: 'REJECTED' });
      await settle();
    });

    it('409 no_vacancies_left ao contratar chega traduzido na tela', async () => {
      const offered: ApplicationFull = { ...PENDING_APPLICATION, status: 'OFFERED' };
      await render(offered);

      clickButton(fixture, 'Contratado');
      await settle();
      clickButton(fixture, 'Confirmar');

      controller
        .expectOne(url('applications/42/status'))
        .flush(
          { statusCode: 409, error: 'Conflict', reason: 'no_vacancies_left', message: 'Sem vagas.' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(textOf(fixture)).toContain('Não há mais vagas disponíveis para contratação nesta vaga.');
    });

    it('409 de mudança concorrente orienta recarregar e emite changed', async () => {
      await render(PENDING_APPLICATION);
      let changedCount = 0;
      fixture.componentRef.instance.changed.subscribe(() => changedCount++);

      clickButton(fixture, 'Em avaliação');
      await settle();
      clickButton(fixture, 'Confirmar');

      controller.expectOne(url('applications/42/status')).flush(
        {
          statusCode: 409,
          error: 'Conflict',
          reason: 'application_status_changed_concurrently',
          message: 'Mudança concorrente.',
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(textOf(fixture)).toContain('Recarregue a lista');
      expect(changedCount).toBe(1);
    });

    it('estágio INTERVIEW habilita agendar entrevista e cria o registro com ISO 8601', async () => {
      await render({ ...PENDING_APPLICATION, status: 'INTERVIEW' });
      let changedEvents = 0;
      fixture.componentRef.instance.changed.subscribe(() => changedEvents++);
      expect(buttons(fixture).some((button) => button.textContent?.includes('Agendar entrevista'))).toBe(true);

      clickButtonContaining(fixture, 'Agendar entrevista');
      await settle();

      const datetime = fixture.nativeElement.querySelector('#scheduledAt') as HTMLInputElement;
      datetime.value = '2026-10-01T14:00';
      datetime.dispatchEvent(new Event('input'));
      await settle();

      clickButton(fixture, 'Agendar');

      const request = controller.expectOne(url('applications/42/interviews'));
      expect(request.request.method).toBe('POST');
      const body = request.request.body as { scheduledAt: string };
      expect(new Date(body.scheduledAt).toISOString()).toBe(body.scheduledAt);
      expect(body.scheduledAt).toContain('2026-10-01T');
      request.flush({
        id: 5,
        applicationId: 42,
        interviewerId: null,
        scheduledAt: body.scheduledAt,
        durationMinutes: null,
        isRemote: true,
        location: null,
        meetingLink: null,
        status: 'SCHEDULED',
        feedback: null,
        previousInterviewId: null,
        createdAt: '2026-09-27T12:00:00.000Z',
        updatedAt: '2026-09-27T12:00:00.000Z',
      });
      await settle();

      // O toast vive no shell (fora desta fixture): aqui validamos o evento de
      // recarga, que é o que a página usa para reexibir a entrevista criada.
      expect(changedEvents).toBeGreaterThan(0);
    });

    it('409 application_not_in_interview_stage é traduzido se a regra for violada', async () => {
      await render({ ...PENDING_APPLICATION, status: 'INTERVIEW' });
      clickButtonContaining(fixture, 'Agendar entrevista');
      await settle();

      const datetime = fixture.nativeElement.querySelector('#scheduledAt') as HTMLInputElement;
      datetime.value = '2026-10-01T14:00';
      datetime.dispatchEvent(new Event('input'));
      await settle();
      clickButton(fixture, 'Agendar');

      controller.expectOne(url('applications/42/interviews')).flush(
        {
          statusCode: 409,
          error: 'Conflict',
          reason: 'application_not_in_interview_stage',
          message: 'Candidatura não está em entrevista.',
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(textOf(fixture)).toContain('mova a candidatura para o estágio "Entrevista" primeiro');
    });

    it('reagendar entrevista usa PATCH com RESCHEDULED (backend responde 201 com a nova)', async () => {
      await render({ ...PENDING_APPLICATION, status: 'INTERVIEW' }, [
        {
          id: 5,
          applicationId: 42,
          interviewerId: null,
          scheduledAt: '2026-10-01T14:00:00.000Z',
          durationMinutes: 45,
          isRemote: true,
          location: null,
          meetingLink: 'https://meet.example.com/abc',
          status: 'SCHEDULED',
          feedback: null,
          previousInterviewId: null,
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
        },
      ]);

      clickButton(fixture, 'Reagendar');
      await settle();
      const datetime = fixture.nativeElement.querySelector('#scheduledAt') as HTMLInputElement;
      datetime.value = '2026-10-05T10:30';
      datetime.dispatchEvent(new Event('input'));
      await settle();
      clickButton(fixture, 'Criar nova data');

      const request = controller.expectOne(url('interviews/5'));
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toMatchObject({ status: 'RESCHEDULED' });
      request.flush(
        {
          id: 6,
          applicationId: 42,
          scheduledAt: (request.request.body as { scheduledAt: string }).scheduledAt,
          status: 'SCHEDULED',
          previousInterviewId: 5,
          isRemote: true,
          interviewerId: null,
          durationMinutes: 45,
          location: null,
          meetingLink: 'https://meet.example.com/abc',
          feedback: null,
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
        },
        { status: 201, statusText: 'Created' },
      );
      await settle();

      // O aviso de sucesso explica o contrato 201 (nova entrevista criada).
      expect(textOf(fixture)).not.toContain('Não foi possível');
    });

    it('baixar currículo chama GET /documents/:id autenticado como blob', async () => {
      await render(PENDING_APPLICATION);
      clickButton(fixture, 'Baixar currículo');

      const request = controller.expectOne(url('documents/11'));
      expect(request.request.responseType).toBe('blob');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-recrutador');
      request.flush(new Blob(['pdf']));
      await settle();
    });

    it('candidatura encerrada não oferece transição nenhuma', async () => {
      await render({ ...PENDING_APPLICATION, status: 'HIRED' });
      expect(textOf(fixture)).toContain('Esta candidatura está encerrada');
      expect(buttons(fixture).some((button) => button.textContent?.trim() === 'Recusado')).toBe(false);
    });
  });

  describe('candidaturas da vaga (JobApplicationsPageComponent)', () => {
    async function render(path = '/recruiter/jobs/7') {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl(path);
      await settle();
      return host;
    }

    it('lista as candidaturas da vaga e carrega perfil + entrevistas da selecionada', async () => {
      const host = await render();

      controller.expectOne(url('jobs/7')).flush(SCOPED_JOB);
      controller
        .expectOne(url('jobs/7/applications?page=1&limit=10'))
        .flush({ data: [PENDING_APPLICATION], page: 1, limit: 10, total: 1 });
      await settle();
      // nome da empresa (a candidatura traz só companyId)
      controller.expectOne(url('companies/1')).flush({ id: 1, name: 'Tech Solutions Ltda', isActive: true });
      await settle();
      controller.expectOne(url('applications/42')).flush(PENDING_APPLICATION);
      controller
        .expectOne(url('candidates/3'))
        .flush({ id: 3, name: 'Candidato Um', headline: 'Dev Node', skills: ['NestJS'] });
      controller.expectOne(url('applications/42/interviews')).flush([]);
      await settle();

      const text = textOf(host);
      expect(text).toContain('Desenvolvedor(a) Backend Node.js');
      expect(text).toContain('Tech Solutions Ltda');
      expect(text).toContain('1/2 posição(ões) preenchida(s)');
      expect(text).toContain('Candidato Um');
      expect(text).toContain('Carta de apresentação');
      expect(text).toContain('Tenho 3 anos de experiência');
      expect(text).toContain('Nenhuma entrevista agendada');
    });

    it('payload reduzido (PENDING) avisa que os dados completos aparecem depois', async () => {
      const host = await render();

      controller.expectOne(url('jobs/7')).flush(SCOPED_JOB);
      controller.expectOne(url('companies/1')).flush({ id: 1, name: 'Tech Solutions Ltda', isActive: true });
      controller.expectOne(url('jobs/7/applications?page=1&limit=10')).flush({
        data: [
          {
            id: 43,
            jobId: 7,
            status: 'PENDING',
            coverLetter: null,
            resumeDocument: null,
            createdAt: '2026-09-21T12:00:00.000Z',
            candidate: { id: 4, name: 'Outra Candidata', headline: 'Dev Backend', skills: ['Node'] },
          },
        ],
        page: 1,
        limit: 10,
        total: 1,
      });
      await settle();
      controller.expectOne(url('applications/43')).flush({
        id: 43,
        jobId: 7,
        status: 'PENDING',
        coverLetter: null,
        resumeDocument: null,
        createdAt: '2026-09-21T12:00:00.000Z',
        candidate: { id: 4, name: 'Outra Candidata', headline: 'Dev Backend', skills: ['Node'] },
      });
      controller
        .expectOne(url('candidates/4'))
        .flush({ id: 4, name: 'Outra Candidata', headline: 'Dev Backend', skills: ['Node'] });
      controller.expectOne(url('applications/43/interviews')).flush([]);
      await settle();

      const text = textOf(host);
      expect(text).toContain('Outra Candidata');
      expect(text).toContain('Dev Backend');
      expect(text).toContain('Visão de triagem');
      expect(text).toContain('Esta candidatura não tem currículo anexado');
    });

    it('vaga de outra empresa (404 anti-enumeração) mostra "não encontrada", nunca "sem permissão"', async () => {
      const host = await render();

      controller
        .expectOne(url('jobs/7'))
        .flush(
          { statusCode: 404, error: 'Not Found', reason: 'job_not_found', message: 'Vaga não encontrada.' },
          { status: 404, statusText: 'Not Found' },
        );
      await settle();

      expect(textOf(host)).toContain('Vaga não encontrada');
      expect(textOf(host).toLowerCase()).not.toContain('permiss');
    });

    it('filtro por status vai como query string para o backend', async () => {
      const host = await render();

      controller.expectOne(url('jobs/7')).flush(SCOPED_JOB);
      controller.expectOne(url('companies/1')).flush({ id: 1, name: 'Tech Solutions Ltda', isActive: true });
      controller
        .expectOne(url('jobs/7/applications?page=1&limit=10'))
        .flush({ data: [], page: 1, limit: 10, total: 0 });
      await settle();

      const select = host.nativeElement.querySelector('#appStatus') as HTMLSelectElement;
      select.value = 'INTERVIEW';
      select.dispatchEvent(new Event('change'));
      await settle();

      const request = controller.expectOne(url('jobs/7/applications?page=1&limit=10&status=INTERVIEW'));
      request.flush({ data: [], page: 1, limit: 10, total: 0 });
      await settle();
      expect(request.request.params.get('status')).toBe('INTERVIEW');
    });
  });

  describe('minhas vagas (MyJobsPageComponent)', () => {
    async function render() {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/recruiter/jobs');
      await settle();
      return host;
    }

    it('recrutador sem empresa (404 em /jobs/mine) vê o estado vazio explicativo', async () => {
      const host = await render();
      controller
        .expectOne(url('jobs/mine?page=1&limit=10'))
        .flush(
          { statusCode: 404, error: 'Not Found', reason: 'job_not_found', message: 'Vaga não encontrada.' },
          { status: 404, statusText: 'Not Found' },
        );
      await settle();

      expect(textOf(host)).toContain('ainda não está vinculada a uma empresa');
    });

    it('lista as vagas com preenchimento e só oferece transições válidas', async () => {
      const host = await render();
      controller.expectOne(url('jobs/mine?page=1&limit=10')).flush({
        data: [{ ...SCOPED_JOB, status: 'DRAFT' }],
        page: 1,
        limit: 10,
        total: 1,
      });
      await settle();

      expect(textOf(host)).toContain('Desenvolvedor(a) Backend Node.js');
      expect(textOf(host)).toContain('1/2');
      expect(textOf(host)).toContain('Rascunho');

      clickButton(host, 'Status');
      await settle();

      const modalText = (host.nativeElement.querySelector('.modal') as HTMLElement).textContent ?? '';
      expect(modalText).toContain('Aberta');
      expect(modalText).toContain('Cancelada');
      // DRAFT → {OPEN, CANCELED}: pausar/preencher não são transições válidas.
      expect(modalText).not.toContain('Pausada');
      expect(modalText).not.toContain('Preenchida');

      // ...e o filtro da página continua listando todos os status
      expect(textOf(host)).toContain('Pausada');
    });

    it('publicar vaga: PATCH /jobs/:id/status {status:"OPEN"}', async () => {
      const host = await render();
      controller.expectOne(url('jobs/mine?page=1&limit=10')).flush({
        data: [{ ...SCOPED_JOB, status: 'DRAFT' }],
        page: 1,
        limit: 10,
        total: 1,
      });
      await settle();

      clickButton(host, 'Status');
      await settle();
      clickButtonContaining(host, 'Aberta');

      const request = controller.expectOne(url('jobs/7/status'));
      expect(request.request.body).toEqual({ status: 'OPEN' });
      request.flush({ ...SCOPED_JOB, status: 'OPEN' });
      await settle();

      // O toast vive no shell (fora desta fixture): o efeito verificável aqui é a
      // linha atualizada sem recarregar a lista inteira.
      expect(controller.match(url('jobs/mine?page=1&limit=10'))).toHaveLength(0);
      expect(textOf(host)).toContain('Aberta');
    });

    it('409 job_not_fully_filled ao marcar como preenchida sem contratar todo mundo', async () => {
      const host = await render();
      controller.expectOne(url('jobs/mine?page=1&limit=10')).flush({
        data: [SCOPED_JOB],
        page: 1,
        limit: 10,
        total: 1,
      });
      await settle();

      clickButton(host, 'Status');
      await settle();
      clickButtonContaining(host, 'Preenchida');

      controller
        .expectOne(url('jobs/7/status'))
        .flush(
          { statusCode: 409, error: 'Conflict', reason: 'job_not_fully_filled', message: 'Vagas não preenchidas.' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(textOf(host)).toContain('todas as posições forem contratadas');
    });
  });
});

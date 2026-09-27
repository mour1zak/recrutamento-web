import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import type { ApiError } from '../api-error';
import type { Company } from '../models';
import { apiKeyInterceptor } from '../http/api-key.interceptor';
import { authInterceptor } from '../http/auth.interceptor';
import { APPLICATION_STATUS_TRANSITIONS, ApplicationsService } from './applications.service';
import { CompaniesService } from './companies.service';
import { CompanyDirectoryService } from './company-directory.service';
import { JobsService, JOB_STATUS_TRANSITIONS } from './jobs.service';
import { DocumentsService, validateUpload } from './documents.service';
import { RolesService, UsersService } from './users.service';

/**
 * Contratos de request das services — o que o front envia tem que ser exatamente
 * o que os DTOs do backend aceitam (`whitelist` + `forbidNonWhitelisted`: campo
 * extra ou ausente vira `400`).
 */
describe('Services → contrato HTTP com o backend', () => {
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
    sessionStorage.setItem(
      'recrutamento.session',
      JSON.stringify({
        user: { id: 3, name: 'Candidato', email: 'c@x.co', role: 'CANDIDATE' },
        accessToken: 'token',
        refreshToken: 'refresh',
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    sessionStorage.clear();
  });

  const url = (path: string) => `${environment.apiUrl}/${path}`;

  // -------------------------------------------------------------------------
  // Vagas
  // -------------------------------------------------------------------------

  describe('JobsService', () => {
    it('GET /jobs envia page/limit/search/sortOrder como query string', () => {
      TestBed.inject(JobsService).listPublicJobs({ page: 2, limit: 10, search: 'node', sortOrder: 'asc' }).subscribe();

      const request = controller.expectOne(url('jobs?page=2&limit=10&search=node&sortOrder=asc'));
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
      request.flush({ data: [], page: 2, limit: 10, total: 0 });
    });

    it('GET /jobs omite parâmetros vazios (backend rejeitaria search vazio? não, mas evita ruído)', () => {
      TestBed.inject(JobsService).listPublicJobs({ page: 1, limit: 10 }).subscribe();
      const request = controller.expectOne(url('jobs?page=1&limit=10'));
      expect(request.request.params.has('search')).toBe(false);
      request.flush({ data: [], page: 1, limit: 10, total: 0 });
    });

    it('POST /jobs não envia salaryMin/salaryMax quando vazios (forbidNonWhitelisted)', () => {
      TestBed.inject(JobsService)
        .createJob({ title: 'Dev', description: 'Descrição', vacancies: 2, isRemote: true })
        .subscribe();

      const request = controller.expectOne(url('jobs'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        title: 'Dev',
        description: 'Descrição',
        vacancies: 2,
        isRemote: true,
      });
      request.flush({ id: 1 });
    });

    it('POST /jobs envia companyId quando informado (caso do ADMIN)', () => {
      TestBed.inject(JobsService)
        .createJob({ title: 'Dev', description: 'D', vacancies: 1, isRemote: false, companyId: 7 })
        .subscribe();

      const request = controller.expectOne(url('jobs'));
      expect(request.request.body).toMatchObject({ companyId: 7 });
      request.flush({ id: 2 });
    });

    it('PATCH /jobs/:id/status envia só o status', () => {
      TestBed.inject(JobsService).updateJobStatus(5, 'OPEN').subscribe();
      const request = controller.expectOne(url('jobs/5/status'));
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ status: 'OPEN' });
      request.flush({ id: 5, status: 'OPEN' });
    });

    it('GET /jobs/mine filtra por status', () => {
      TestBed.inject(JobsService).listMyJobs({ status: 'DRAFT', page: 1, limit: 20 }).subscribe();
      const request = controller.expectOne(url('jobs/mine?page=1&limit=20&status=DRAFT'));
      request.flush({ data: [], page: 1, limit: 20, total: 0 });
    });

    it('transições de status espelham a tabela do backend', () => {
      expect(JOB_STATUS_TRANSITIONS.DRAFT).toEqual(['OPEN', 'CANCELED']);
      expect(JOB_STATUS_TRANSITIONS.OPEN).toEqual(['PAUSED', 'FILLED', 'CLOSED', 'CANCELED']);
      expect(JOB_STATUS_TRANSITIONS.PAUSED).toEqual(['OPEN', 'CANCELED']);
      expect(JOB_STATUS_TRANSITIONS.FILLED).toEqual(['CLOSED']);
      expect(JOB_STATUS_TRANSITIONS.CLOSED).toEqual([]);
      expect(JOB_STATUS_TRANSITIONS.CANCELED).toEqual([]);
    });

    it('409 vacancies_below_filled_count chega traduzido', () => {
      const captured: ApiError[] = [];
      TestBed.inject(JobsService)
        .updateJob(5, { vacancies: 1 })
        .subscribe({ error: (error: ApiError) => captured.push(error) });

      controller
        .expectOne(url('jobs/5'))
        .flush(
          { statusCode: 409, reason: 'vacancies_below_filled_count', message: 'x' },
          { status: 409, statusText: 'Conflict' },
        );

      expect(captured[0]?.message).toContain('já contratadas');
    });
  });

  // -------------------------------------------------------------------------
  // Candidaturas
  // -------------------------------------------------------------------------

  describe('ApplicationsService', () => {
    it('POST /jobs/:jobId/applications envia coverLetter e resumeDocumentId', () => {
      TestBed.inject(ApplicationsService)
        .create(9, { coverLetter: 'Tenho 3 anos de Node.', resumeDocumentId: 4 })
        .subscribe();

      const request = controller.expectOne(url('jobs/9/applications'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        coverLetter: 'Tenho 3 anos de Node.',
        resumeDocumentId: 4,
      });
      request.flush({ id: 1, jobId: 9, status: 'PENDING' });
    });

    it('candidatura sem carta e sem anexo envia corpo vazio (campos opcionais)', () => {
      TestBed.inject(ApplicationsService).create(9, {}).subscribe();
      const request = controller.expectOne(url('jobs/9/applications'));
      expect(request.request.body).toEqual({});
      request.flush({ id: 1 });
    });

    it('PATCH /applications/:id/status envia status + reason quando informado', () => {
      TestBed.inject(ApplicationsService).updateStatus(1, 'REJECTED', 'fora do perfil').subscribe();
      const request = controller.expectOne(url('applications/1/status'));
      expect(request.request.body).toEqual({ status: 'REJECTED', reason: 'fora do perfil' });
      request.flush({ id: 1, status: 'REJECTED' });
    });

    it('PATCH /applications/:id/withdraw sem motivo envia corpo vazio', () => {
      TestBed.inject(ApplicationsService).withdraw(1).subscribe();
      const request = controller.expectOne(url('applications/1/withdraw'));
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({});
      request.flush({ id: 1, status: 'WITHDRAWN' });
    });

    it('GET /applications/me filtra por status e pagina', () => {
      TestBed.inject(ApplicationsService).listMine({ status: 'INTERVIEW', page: 1, limit: 10 }).subscribe();
      controller.expectOne(url('applications/me?page=1&limit=10&status=INTERVIEW')).flush({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
      });
    });

    it('transições de candidatura espelham a tabela do backend', () => {
      expect(APPLICATION_STATUS_TRANSITIONS.PENDING).toEqual(['UNDER_REVIEW', 'REJECTED']);
      expect(APPLICATION_STATUS_TRANSITIONS.UNDER_REVIEW).toEqual(['INTERVIEW', 'REJECTED']);
      expect(APPLICATION_STATUS_TRANSITIONS.INTERVIEW).toEqual(['OFFERED', 'REJECTED']);
      expect(APPLICATION_STATUS_TRANSITIONS.OFFERED).toEqual(['HIRED', 'REJECTED']);
      expect(APPLICATION_STATUS_TRANSITIONS.HIRED).toEqual([]);
      expect(APPLICATION_STATUS_TRANSITIONS.REJECTED).toEqual([]);
      expect(APPLICATION_STATUS_TRANSITIONS.WITHDRAWN).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Empresas (inclui o fluxo do CEP)
  // -------------------------------------------------------------------------

  describe('CompaniesService', () => {
    it('POST /companies envia name + cep (obrigatórios) e cnpj/description quando preenchidos', () => {
      TestBed.inject(CompaniesService)
        .create({ name: 'Tech Solutions Ltda', cnpj: '12.345.678/0001-90', cep: '01310-100' })
        .subscribe();

      const request = controller.expectOne(url('companies'));
      expect(request.request.body).toEqual({
        name: 'Tech Solutions Ltda',
        cep: '01310-100',
        cnpj: '12.345.678/0001-90',
      });
      request.flush({ id: 1, name: 'Tech Solutions Ltda', cep: '01310-100' });
    });

    it('nunca envia street/city/state — quem resolve o endereço é o backend', () => {
      TestBed.inject(CompaniesService).create({ name: 'X', cep: '01310-100' }).subscribe();
      const request = controller.expectOne(url('companies'));
      const body = request.request.body as Record<string, unknown>;
      expect(body['street']).toBeUndefined();
      expect(body['city']).toBeUndefined();
      expect(body['state']).toBeUndefined();
      request.flush({ id: 2 });
    });

    it('409 cnpj_duplicado chega traduzido', () => {
      const captured: ApiError[] = [];
      TestBed.inject(CompaniesService)
        .create({ name: 'X', cnpj: '12345678000190', cep: '01310-100' })
        .subscribe({ error: (error: ApiError) => captured.push(error) });

      controller
        .expectOne(url('companies'))
        .flush({ statusCode: 409, reason: 'cnpj_duplicado', message: 'x' }, { status: 409, statusText: 'Conflict' });

      expect(captured[0]?.message).toContain('Já existe uma empresa');
    });

    it('GET /companies/:id/stats devolve os indicadores crus do backend', () => {
      TestBed.inject(CompaniesService).getStats(1).subscribe();
      const request = controller.expectOne(url('companies/1/stats'));
      expect(request.request.headers.get('Authorization')).toBe('Bearer token');
      request.flush({
        companyId: 1,
        jobs: { total: 3, byStatus: { DRAFT: 1, OPEN: 2, PAUSED: 0, FILLED: 0, CLOSED: 0, CANCELED: 0 } },
        applications: {
          total: 10,
          byStatus: { PENDING: 4, UNDER_REVIEW: 3, INTERVIEW: 2, OFFERED: 0, HIRED: 1, REJECTED: 0, WITHDRAWN: 0 },
          conversionRate: 0.1,
          avgTimeToHireDays: 12.5,
        },
      });
    });

    it('desativar/reativar usam PATCH sem corpo e devolvem a empresa atualizada', () => {
      TestBed.inject(CompaniesService).deactivate(3).subscribe();
      const deactivated = controller.expectOne(url('companies/3/deactivate'));
      expect(deactivated.request.method).toBe('PATCH');
      deactivated.flush({ id: 3, isActive: false });

      TestBed.inject(CompaniesService).reactivate(3).subscribe();
      const reactivated = controller.expectOne(url('companies/3/reactivate'));
      expect(reactivated.request.method).toBe('PATCH');
      reactivated.flush({ id: 3, isActive: true });
    });
  });

  // -------------------------------------------------------------------------
  // Usuários e papéis (ADMIN)
  // -------------------------------------------------------------------------

  describe('UsersService / RolesService', () => {
    it('GET /users envia role, companyId e isActive como query string', () => {
      TestBed.inject(UsersService)
        .list({ role: 'RECRUITER', companyId: 2, isActive: false, page: 1, limit: 10 })
        .subscribe();
      const request = controller.expectOne(url('users?page=1&limit=10&role=RECRUITER&companyId=2&isActive=false'));
      request.flush({ data: [], page: 1, limit: 10, total: 0 });
    });

    it('PATCH /users/:id/company aceita null para desvincular (campo obrigatório no corpo)', () => {
      TestBed.inject(UsersService).changeCompany(4, null).subscribe();
      const request = controller.expectOne(url('users/4/company'));
      expect(request.request.body).toEqual({ companyId: null });
      request.flush({ id: 4, companyId: null });
    });

    it('PATCH /users/:id/role envia roleId', () => {
      TestBed.inject(UsersService).changeRole(4, 2).subscribe();
      const request = controller.expectOne(url('users/4/role'));
      expect(request.request.body).toEqual({ roleId: 2 });
      request.flush({ id: 4, roleId: 2 });
    });

    it('PUT /roles/:id/permissions substitui o conjunto completo', () => {
      TestBed.inject(RolesService).updatePermissions(1, [1, 2, 3]).subscribe();
      const request = controller.expectOne(url('roles/1/permissions'));
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ permissionIds: [1, 2, 3] });
      request.flush({ id: 1, permissions: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Documentos
  // -------------------------------------------------------------------------

  describe('DocumentsService', () => {
    it('POST /documents é multipart com os campos file e type', () => {
      const file = new File(['conteudo'], 'curriculo.pdf', { type: 'application/pdf' });
      TestBed.inject(DocumentsService).upload(file, 'RESUME').subscribe();

      const request = controller.expectOne(url('documents'));
      expect(request.request.method).toBe('POST');
      const body = request.request.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('type')).toBe('RESUME');
      expect((body.get('file') as File).name).toBe('curriculo.pdf');
      request.flush({ id: 1, filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 8 });
    });

    it('GET /documents/:id baixa como blob autenticado', () => {
      TestBed.inject(DocumentsService).download(12, 'curriculo.pdf').subscribe();
      const request = controller.expectOne(url('documents/12'));
      expect(request.request.responseType).toBe('blob');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token');
      request.flush(new Blob(['pdf']));
    });

    it('valida MIME e tamanho antes do envio (mesmas regras do backend)', () => {
      const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      expect(validateUpload(pdf).ok).toBe(true);
      expect(validateUpload(new File(['x'], 'a.exe', { type: 'application/x-msdownload' })).reason).toBe(
        'mime_type_invalido',
      );
      expect(validateUpload(null).reason).toBe('arquivo_ausente');

      const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
      expect(validateUpload(big).reason).toBe('arquivo_excede_tamanho_maximo');
    });
  });
});

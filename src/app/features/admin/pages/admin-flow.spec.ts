import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { DebugElement } from '@angular/core';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { apiKeyInterceptor } from '../../../core/http/api-key.interceptor';
import { authInterceptor } from '../../../core/http/auth.interceptor';
import { CepFieldComponent } from '../../../shared/forms/cep-field';
import { CompaniesPageComponent } from '../pages/companies-page';
import { CompanyFormPageComponent } from '../pages/company-form-page';
import { RolesPageComponent } from '../pages/roles-page';
import { UsersPageComponent } from '../pages/users-page';

@Component({ selector: 'app-stub', template: 'stub' })
class StubComponent {}

@Component({
  selector: 'app-outlet-host',
  imports: [RouterOutlet],
  template: `<div id="root-host"><router-outlet /></div>`,
})
class OutletHostComponent {}

const url = (path: string) => `${environment.apiUrl}/${path}`;

function adminSession(): void {
  localStorage.setItem(
    'recrutamento.session',
    JSON.stringify({
      user: { id: 1, name: 'Admin Geral', email: 'admin@recrutamento.test', role: 'ADMIN' },
      accessToken: 'token-admin',
      refreshToken: 'refresh-admin',
    }),
  );
}

/** Deixa navegações do Router e efeitos de signals assentarem. */
async function settle(_router?: Router, rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    TestBed.flushEffects();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.flushEffects();
}

function textOf(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent as string;
}

function setValue(fixture: { nativeElement: HTMLElement }, selector: string, value: string): void {
  const element = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
  element.value = value;
  element.dispatchEvent(new Event('input'));
  element.dispatchEvent(new Event('blur'));
}

/** Acha um checkbox pelo texto do rótulo (ex.: a permission key). */
function checkboxByLabel(fixture: { nativeElement: HTMLElement }, label: string): HTMLInputElement {
  const labels = [...fixture.nativeElement.querySelectorAll('label.checkbox')] as HTMLElement[];
  const found = labels.find((element) => element.textContent?.includes(label));
  if (!found) throw new Error(`Checkbox com rótulo "${label}" não encontrado.`);
  return found.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function allButtons(fixture: { nativeElement: HTMLElement }, scope = ''): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll(`${scope} button`)] as HTMLButtonElement[];
}

function clickButton(fixture: { nativeElement: HTMLElement }, label: string, scope = ''): void {
  const button = allButtons(fixture, scope).find(
    (element) => element.textContent?.trim() === label || element.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(
      `Botão "${label}" não encontrado. Disponíveis: ${allButtons(fixture, scope)
        .map((element) => element.textContent?.trim())
        .join(' | ')}`,
    );
  }
  button.click();
}

/** Cliques de confirmação de diálogo: só dentro do rodapé do modal. */
function clickModalConfirm(fixture: { nativeElement: HTMLElement }, label: string): void {
  clickButton(fixture, label, '.modal__footer');
}

/** Responde todas as requisições pendentes de uma URL com o mesmo corpo. */
type FlushBody = string | number | boolean | object | ArrayBuffer | Blob | null;

function flushAll(controller: HttpTestingController, matchUrl: string, body: FlushBody): void {
  controller.match(matchUrl).forEach((request) => request.flush(body));
}

/**
 * Roteiro de apresentação, passo 3 (admin): criar empresa com CEP → gerenciar
 * usuários → ajustar permissões por papel.
 *
 * O CEP é o ponto mais sensível do roteiro: aqui estão cobertos os três
 * desfechos possíveis do provedor externo (válido, inexistente, indisponível) e
 * o que cada um causa na UI.
 */
describe('Fluxo do admin — empresas com CEP, usuários e permissões', () => {
  let controller: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    adminSession();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/companies', component: CompaniesPageComponent },
          { path: 'admin/companies/new', component: CompanyFormPageComponent },
          { path: 'admin/companies/:id/edit', component: CompanyFormPageComponent },
          { path: 'admin/users', component: UsersPageComponent },
          { path: 'admin/roles', component: RolesPageComponent },
          { path: 'recruiter/stats', component: StubComponent },
          { path: 'recruiter/jobs', component: StubComponent },
          { path: 'recruiter/jobs/new', component: StubComponent },
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

  // -------------------------------------------------------------------------
  // Campo de CEP (componente reutilizável dos formulários)
  // -------------------------------------------------------------------------

  describe('campo de CEP com autopreenchimento', () => {
    let fixture: ComponentFixture<CepFieldComponent>;

    beforeEach(() => {
      fixture = TestBed.createComponent(CepFieldComponent);
      fixture.autoDetectChanges();
    });

    function typeCep(value: string): void {
      const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('mascara a digitação no formato 00000-000', async () => {
      typeCep('01310100');
      await settle();
      controller.expectOne(url('cep/01310-100')).flush({ street: 'Avenida Paulista', city: 'São Paulo', state: 'SP' });
      await settle();

      const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
      expect(input.value).toBe('01310-100');
    });

    it('CEP válido: consulta o backend, mostra o endereço e não bloqueia o formulário', async () => {
      const addresses: unknown[] = [];
      const blocked: boolean[] = [];
      fixture.componentInstance.addressChange.subscribe((state) => addresses.push(state));
      fixture.componentInstance.blockedChange.subscribe((value) => blocked.push(value));

      typeCep('01310100');
      await settle();

      const request = controller.expectOne(url('cep/01310-100'));
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.get('x-api-key')).toBe(environment.apiKey);
      request.flush({ street: 'Avenida Paulista', city: 'São Paulo', state: 'SP' });
      await settle();

      expect(textOf(fixture)).toContain('Avenida Paulista');
      expect(textOf(fixture)).toContain('São Paulo - SP');
      expect(addresses).toEqual([{ cep: '01310-100', street: 'Avenida Paulista', city: 'São Paulo', state: 'SP' }]);
      expect(blocked).toEqual([false]);
    });

    it('400 cep_nao_encontrado: mensagem do briefing e formulário bloqueado', async () => {
      const blocked: boolean[] = [];
      fixture.componentInstance.blockedChange.subscribe((value) => blocked.push(value));

      typeCep('00000000');
      await settle();
      controller
        .expectOne(url('cep/00000-000'))
        .flush(
          { statusCode: 400, error: 'Bad Request', reason: 'cep_nao_encontrado', message: 'CEP informado não existe.' },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(textOf(fixture)).toContain('CEP não encontrado, verifique e tente novamente.');
      expect(blocked.at(-1)).toBe(true);
    });

    it('502 servico_cep_indisponivel: avisa, mas deixa continuar com endereço em branco', async () => {
      const blocked: boolean[] = [];
      fixture.componentInstance.blockedChange.subscribe((value) => blocked.push(value));

      typeCep('01310100');
      await settle();
      controller.expectOne(url('cep/01310-100')).flush(
        {
          statusCode: 502,
          error: 'Bad Gateway',
          reason: 'servico_cep_indisponivel',
          message: 'Não foi possível consultar o CEP agora.',
        },
        { status: 502, statusText: 'Bad Gateway' },
      );
      await settle();

      expect(textOf(fixture)).toContain('Não foi possível confirmar o endereço agora');
      expect(textOf(fixture)).toContain('você pode continuar');
      expect(textOf(fixture)).toContain('endereço fica em branco');
      expect(blocked.at(-1)).toBe(false);
    });

    it('não consulta CEP incompleto (economia de chamada externa)', async () => {
      typeCep('01310');
      await settle();
      expect(controller.match(() => true)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empresas
  // -------------------------------------------------------------------------

  describe('criar/editar empresa', () => {
    async function render(path: string) {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl(path);
      await settle();
      return host;
    }

    it('cria empresa com name + cnpj + cep (sem street/city/state: quem resolve é o backend)', async () => {
      const host = await render('/admin/companies/new');

      setValue(host, '#name', 'Tech Solutions Ltda');
      setValue(host, '#cnpj', '12345678000190');
      setValue(host, '#companyCep', '01310100');
      await settle();
      controller.expectOne(url('cep/01310-100')).flush({ street: 'Avenida Paulista', city: 'São Paulo', state: 'SP' });
      await settle();

      setValue(host, '#description', 'Consultoria de engenharia de software.');
      clickButton(host, 'Criar empresa');

      const request = controller.expectOne(url('companies'));
      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-admin');
      expect(request.request.body).toEqual({
        name: 'Tech Solutions Ltda',
        cep: '01310-100',
        cnpj: '12.345.678/0001-90',
        description: 'Consultoria de engenharia de software.',
      });

      request.flush(
        {
          id: 4,
          name: 'Tech Solutions Ltda',
          cnpj: '12345678000190',
          description: 'Consultoria de engenharia de software.',
          isActive: true,
          cep: '01310-100',
          street: 'Avenida Paulista',
          city: 'São Paulo',
          state: 'SP',
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
        },
        { status: 201, statusText: 'Created' },
      );
      await settle();

      // Aguarda a navegação que a própria tela dispara (criar → modo edição).
      const formDebug = (host as unknown as { debugElement: DebugElement }).debugElement.query(
        (node) => node.componentInstance instanceof CompanyFormPageComponent,
      );
      const formInstance = formDebug?.componentInstance as CompanyFormPageComponent | undefined;
      await formInstance?.navigation;
      await settle();

      expect(router.url).toContain('/admin/companies/4/edit');

      // A tela recarrega a empresa já criada (modo edição canônico).
      controller.expectOne(url('companies/4')).flush({
        id: 4,
        name: 'Tech Solutions Ltda',
        cnpj: '12345678000190',
        description: 'Consultoria de engenharia de software.',
        isActive: true,
        cep: '01310-100',
        street: 'Avenida Paulista',
        city: 'São Paulo',
        state: 'SP',
        createdAt: '2026-09-27T12:00:00.000Z',
        updatedAt: '2026-09-27T12:00:00.000Z',
      });
      await settle();

      expect(textOf(host)).toContain('Avenida Paulista');
      expect(textOf(host)).toContain('Editar empresa');
    });

    it('provedor de CEP fora do ar: empresa é criada mesmo assim e o addressWarning aparece', async () => {
      const host = await render('/admin/companies/new');

      setValue(host, '#name', 'Empresa Sem Endereço');
      setValue(host, '#companyCep', '01310100');
      await settle();
      controller
        .expectOne(url('cep/01310-100'))
        .flush(
          { statusCode: 502, error: 'Bad Gateway', reason: 'servico_cep_indisponivel', message: 'indisponível' },
          { status: 502, statusText: 'Bad Gateway' },
        );
      await settle();

      clickButton(host, 'Criar empresa');
      const request = controller.expectOne(url('companies'));
      expect(request.request.body).toEqual({ name: 'Empresa Sem Endereço', cep: '01310-100' });
      request.flush(
        {
          id: 5,
          name: 'Empresa Sem Endereço',
          cnpj: null,
          description: null,
          isActive: true,
          cep: '01310-100',
          street: null,
          city: null,
          state: null,
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
          addressWarning:
            'Não foi possível confirmar o endereço agora — você pode continuar, o endereço fica em branco.',
        },
        { status: 201, statusText: 'Created' },
      );
      await settle();
      controller.expectOne(url('companies/5')).flush({
        id: 5,
        name: 'Empresa Sem Endereço',
        cnpj: null,
        description: null,
        isActive: true,
        cep: '01310-100',
        street: null,
        city: null,
        state: null,
        createdAt: '2026-09-27T12:00:00.000Z',
        updatedAt: '2026-09-27T12:00:00.000Z',
        addressWarning: 'Não foi possível confirmar o endereço agora — você pode continuar, o endereço fica em branco.',
      });
      await settle();

      expect(textOf(host)).toContain('Não foi possível confirmar o endereço agora');
    });

    it('CEP inexistente bloqueia o envio (o backend rejeitaria com 400)', async () => {
      const host = await render('/admin/companies/new');

      setValue(host, '#name', 'Tech Solutions Ltda');
      setValue(host, '#companyCep', '00000000');
      await settle();
      controller
        .expectOne(url('cep/00000-000'))
        .flush(
          { statusCode: 400, reason: 'cep_nao_encontrado', message: 'não existe' },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      const submit = [...host.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
        button.textContent?.includes('Criar empresa'),
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(textOf(host)).toContain('Corrija o CEP antes de salvar');
      expect(controller.match(url('companies'))).toHaveLength(0);
    });

    it('CNPJ duplicado (409) mostra a mensagem na tela', async () => {
      const host = await render('/admin/companies/new');

      setValue(host, '#name', 'Tech Solutions Ltda');
      setValue(host, '#cnpj', '12345678000190');
      setValue(host, '#companyCep', '01310100');
      await settle();
      controller.expectOne(url('cep/01310-100')).flush({ street: 'Avenida Paulista', city: 'São Paulo', state: 'SP' });
      await settle();

      clickButton(host, 'Criar empresa');
      controller
        .expectOne(url('companies'))
        .flush(
          { statusCode: 409, error: 'Conflict', reason: 'cnpj_duplicado', message: 'CNPJ já cadastrado.' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(textOf(host)).toContain('Já existe uma empresa cadastrada com este CNPJ.');
    });

    it('edição carrega a empresa por id e salva com PATCH', async () => {
      const host = await render('/admin/companies/4/edit');

      controller.expectOne(url('companies/4')).flush({
        id: 4,
        name: 'Tech Solutions Ltda',
        cnpj: '12345678000190',
        description: 'Consultoria.',
        isActive: true,
        cep: '01310-100',
        street: 'Avenida Paulista',
        city: 'São Paulo',
        state: 'SP',
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
      });
      await settle();

      expect((host.nativeElement.querySelector('#name') as HTMLInputElement).value).toBe('Tech Solutions Ltda');
      expect((host.nativeElement.querySelector('#companyCep') as HTMLInputElement).value).toBe('01310-100');

      setValue(host, '#name', 'Tech Solutions S.A.');
      clickButton(host, 'Salvar alterações');

      const request = controller.expectOne(url('companies/4'));
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toMatchObject({ name: 'Tech Solutions S.A.', cep: '01310-100' });
      request.flush({ id: 4, name: 'Tech Solutions S.A.', isActive: true });
      await settle();

      expect(textOf(host)).toContain('Empresa atualizada');
    });

    it('empresa inativa não pode ser editada (backend responde 404) e a tela explica', async () => {
      const host = await render('/admin/companies/6/edit');
      controller
        .expectOne(url('companies/6'))
        .flush(
          { statusCode: 404, reason: 'company_not_found', message: 'Empresa não encontrada.' },
          { status: 404, statusText: 'Not Found' },
        );
      await settle();

      expect(textOf(host)).toContain('Empresa não encontrada (ou desativada).');
    });
  });

  describe('lista de empresas', () => {
    it('descobre as empresas por id (vagas + usuários) e permite desativar', async () => {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/admin/companies');
      await settle();

      // descoberta: GET /jobs/mine + GET /users
      flushAll(controller, url('jobs/mine?page=1&limit=100'), {
        data: [{ id: 7, companyId: 1, company: { id: 1, name: 'Tech Solutions Ltda' } }],
        page: 1,
        limit: 100,
        total: 1,
      });
      flushAll(controller, url('users?page=1&limit=100'), {
        data: [
          {
            id: 2,
            name: 'Recrutador Um',
            email: 'r@x.co',
            isActive: true,
            roleId: 2,
            companyId: 1,
            createdAt: '2026-09-01T12:00:00.000Z',
            role: { name: 'RECRUITER' },
          },
        ],
        page: 1,
        limit: 100,
        total: 1,
      });
      await settle();
      flushAll(controller, url('companies/1'), {
        id: 1,
        name: 'Tech Solutions Ltda',
        cnpj: '12345678000190',
        description: null,
        isActive: true,
        cep: '01310-100',
        street: 'Avenida Paulista',
        city: 'São Paulo',
        state: 'SP',
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
      });
      await settle();

      expect(textOf(host)).toContain('Tech Solutions Ltda');
      expect(textOf(host)).toContain('Avenida Paulista — São Paulo — SP · CEP 01310-100');

      clickButton(host, 'Desativar');
      await settle();
      expect(textOf(host)).toContain('Desativar a empresa "Tech Solutions Ltda"?');
      expect(textOf(host)).toContain('some da vitrine');

      clickModalConfirm(host, 'Desativar');
      const request = controller.expectOne(url('companies/1/deactivate'));
      expect(request.request.method).toBe('PATCH');
      request.flush({ id: 1, name: 'Tech Solutions Ltda', isActive: false });
      await settle();

      expect(textOf(host)).toContain('Desativada');
    });

    it('409 company_already_inactive chega traduzido', async () => {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/admin/companies');
      await settle();

      flushAll(controller, url('jobs/mine?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      flushAll(controller, url('users?page=1&limit=100'), {
        data: [
          {
            id: 2,
            name: 'R',
            email: 'r@x.co',
            isActive: true,
            roleId: 2,
            companyId: 1,
            createdAt: '2026-09-01T12:00:00.000Z',
            role: { name: 'RECRUITER' },
          },
        ],
        page: 1,
        limit: 100,
        total: 1,
      });
      await settle();
      flushAll(controller, url('companies/1'), {
        id: 1,
        name: 'Empresa X',
        isActive: true,
        createdAt: '2026-09-01T12:00:00.000Z',
      });
      await settle();

      clickButton(host, 'Desativar');
      await settle();
      clickModalConfirm(host, 'Desativar');
      controller
        .expectOne(url('companies/1/deactivate'))
        .flush(
          { statusCode: 409, reason: 'company_already_inactive', message: 'já inativa' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      // recarrega a lista depois do conflito
      flushAll(controller, url('jobs/mine?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      flushAll(controller, url('users?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      await settle();

      expect(textOf(host)).toContain('Nenhuma empresa encontrada');
    });
  });

  // -------------------------------------------------------------------------
  // Usuários
  // -------------------------------------------------------------------------

  describe('gestão de usuários', () => {
    const USERS_PAGE = {
      data: [
        {
          id: 1,
          name: 'Admin Geral',
          email: 'admin@recrutamento.test',
          isActive: true,
          roleId: 3,
          companyId: null,
          createdAt: '2026-09-01T12:00:00.000Z',
          role: { name: 'ADMIN' },
        },
        {
          id: 2,
          name: 'Recrutador Um',
          email: 'recrutador@recrutamento.test',
          isActive: true,
          roleId: 2,
          companyId: 1,
          createdAt: '2026-09-01T12:00:00.000Z',
          role: { name: 'RECRUITER' },
        },
        {
          id: 3,
          name: 'Candidato Um',
          email: 'candidato@recrutamento.test',
          isActive: true,
          roleId: 1,
          companyId: null,
          createdAt: '2026-09-01T12:00:00.000Z',
          role: { name: 'CANDIDATE' },
        },
      ],
      page: 1,
      limit: 10,
      total: 3,
    };

    const ROLES = [
      {
        id: 1,
        name: 'CANDIDATE',
        description: null,
        isSystem: true,
        permissions: [{ id: 11, key: 'job:read', description: null }],
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 2,
        name: 'RECRUITER',
        description: null,
        isSystem: true,
        permissions: [{ id: 21, key: 'job:create', description: null }],
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 3,
        name: 'ADMIN',
        description: null,
        isSystem: true,
        permissions: [{ id: 31, key: 'user:manage', description: null }],
        createdAt: 'x',
        updatedAt: 'x',
      },
    ];

    async function render() {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/admin/users');
      await settle();
      return host;
    }

    async function bootstrapUsers(host: ComponentFixture<OutletHostComponent>) {
      flushAll(controller, url('roles'), ROLES);
      flushAll(controller, url('jobs/mine?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      flushAll(controller, url('users?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      await settle();
      flushAll(controller, url('users?page=1&limit=10'), USERS_PAGE);
      await settle();
      flushAll(controller, url('companies/1'), { id: 1, name: 'Tech Solutions Ltda', isActive: true });
      await settle();
      return host;
    }

    it('lista usuários com papel e empresa resolvidos, e não permite desativar a própria conta', async () => {
      const host = await bootstrapUsers(await render());

      const text = textOf(host);
      expect(text).toContain('Admin Geral');
      expect(text).toContain('Recrutador Um');
      expect(text).toContain('Candidato Um');
      expect(text).toContain('Tech Solutions Ltda');
      expect(text).toContain('3 usuário(s)');

      const selfRow = [...host.nativeElement.querySelectorAll('tbody tr')].find((row: HTMLElement) =>
        row.textContent?.includes('admin@recrutamento.test'),
      ) as HTMLElement;
      const deactivateButton = [...selfRow.querySelectorAll('button')].find((button: HTMLButtonElement) =>
        button.textContent?.includes('Desativar'),
      ) as HTMLButtonElement;
      expect(deactivateButton.disabled).toBe(true);
    });

    it('desativar usuário: PATCH /users/:id/deactivate e linha atualizada sem recarregar', async () => {
      const host = await bootstrapUsers(await render());

      const recruiterRow = [...host.nativeElement.querySelectorAll('tbody tr')].find((row: HTMLElement) =>
        row.textContent?.includes('recrutador@recrutamento.test'),
      ) as HTMLElement;
      (
        [...recruiterRow.querySelectorAll('button')].find((button: HTMLButtonElement) =>
          button.textContent?.includes('Desativar'),
        ) as HTMLButtonElement
      ).click();
      await settle();

      expect(textOf(host)).toContain('Desativar bloqueia o acesso do usuário imediatamente');
      clickModalConfirm(host, 'Desativar');

      const request = controller.expectOne(url('users/2/deactivate'));
      expect(request.request.method).toBe('PATCH');
      request.flush({ ...USERS_PAGE.data[1], isActive: false });
      await settle();

      expect(textOf(host)).toContain('Desativado');
    });

    it('409 last_active_admin é traduzido ao tentar desativar o último admin', async () => {
      const host = await render();
      const otherAdmin = { ...USERS_PAGE.data[0], id: 8, email: 'outro@admin.test' };

      flushAll(controller, url('roles'), ROLES);
      flushAll(controller, url('jobs/mine?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      flushAll(controller, url('users?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      await settle();
      flushAll(controller, url('users?page=1&limit=10'), { ...USERS_PAGE, data: [otherAdmin], total: 1 });
      await settle();

      // id 8 ≠ id do admin logado (1), então o botão fica habilitado
      const row = host.nativeElement.querySelector('tbody tr') as HTMLElement;
      (
        [...row.querySelectorAll('button')].find((button: HTMLButtonElement) =>
          button.textContent?.includes('Desativar'),
        ) as HTMLButtonElement
      ).click();
      await settle();
      clickModalConfirm(host, 'Desativar');

      controller
        .expectOne(url('users/8/deactivate'))
        .flush(
          { statusCode: 409, reason: 'last_active_admin', message: 'último admin' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      // a página recarrega a lista depois do conflito
      flushAll(controller, url('jobs/mine?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      flushAll(controller, url('users?page=1&limit=100'), { data: [], page: 1, limit: 100, total: 0 });
      await settle();

      // O aviso em si é um toast (renderizado no shell, fora desta fixture);
      // o efeito verificável aqui é a recarga da lista após o conflito.
      expect(textOf(host)).toContain('outro@admin.test');
    });

    it('vincular empresa a recrutador: PATCH /users/:id/company com companyId (ou null)', async () => {
      const host = await bootstrapUsers(await render());

      const recruiterRow = [...host.nativeElement.querySelectorAll('tbody tr')].find((row: HTMLElement) =>
        row.textContent?.includes('recrutador@recrutamento.test'),
      ) as HTMLElement;
      (
        [...recruiterRow.querySelectorAll('button')].find((button: HTMLButtonElement) =>
          button.textContent?.includes('Empresa'),
        ) as HTMLButtonElement
      ).click();
      await settle();

      clickModalConfirm(host, 'Salvar');
      const request = controller.expectOne(url('users/2/company'));
      expect(request.request.body).toEqual({ companyId: 1 });
      request.flush({ ...USERS_PAGE.data[1], companyId: 1 });
      await settle();

      expect(textOf(host)).toContain('Tech Solutions Ltda');
    });

    it('trocar papel: PATCH /users/:id/role e 409 recrutador_com_vagas_ativas traduzido', async () => {
      const host = await bootstrapUsers(await render());

      const recruiterRow = [...host.nativeElement.querySelectorAll('tbody tr')].find((row: HTMLElement) =>
        row.textContent?.includes('recrutador@recrutamento.test'),
      ) as HTMLElement;
      (
        [...recruiterRow.querySelectorAll('button')].find(
          (button: HTMLButtonElement) => button.textContent?.trim() === 'Papel',
        ) as HTMLButtonElement
      ).click();
      await settle();

      const select = host.nativeElement.querySelector('#roleId') as HTMLSelectElement;
      const candidateOption = [...select.options].find((option) => option.textContent?.includes('CANDIDATE'));
      select.value = candidateOption?.value ?? '';
      select.dispatchEvent(new Event('change'));
      await settle();

      clickModalConfirm(host, 'Salvar');
      const request = controller.expectOne(url('users/2/role'));
      expect(request.request.body).toEqual({ roleId: 1 });
      request.flush(
        { statusCode: 409, reason: 'recrutador_com_vagas_ativas', message: 'tem vagas ativas' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(textOf(host)).toContain('ainda tem vagas ativas');
    });

    it('filtro por papel vai como ?role para o backend', async () => {
      const host = await bootstrapUsers(await render());

      const select = host.nativeElement.querySelector('#roleFilter') as HTMLSelectElement;
      select.value = 'RECRUITER';
      select.dispatchEvent(new Event('change'));
      await settle();

      const request = controller.expectOne(url('users?page=1&limit=10&role=RECRUITER'));
      expect(request.request.params.get('role')).toBe('RECRUITER');
      request.flush({ ...USERS_PAGE, data: [USERS_PAGE.data[1]], total: 1 });
      await settle();
      flushAll(controller, url('companies/1'), { id: 1, name: 'Tech Solutions Ltda', isActive: true });
      await settle();

      expect(textOf(host)).toContain('1 usuário(s)');
    });
  });

  // -------------------------------------------------------------------------
  // Papéis e permissões
  // -------------------------------------------------------------------------

  describe('permissões por papel', () => {
    const ROLES = [
      {
        id: 1,
        name: 'CANDIDATE',
        description: 'Candidato',
        isSystem: true,
        permissions: [
          { id: 1, key: 'job:read', description: 'Ler vagas' },
          { id: 2, key: 'application:create', description: 'Criar candidatura' },
        ],
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 3,
        name: 'ADMIN',
        description: 'Administrador',
        isSystem: true,
        permissions: [
          { id: 3, key: 'user:manage', description: 'Gerir usuários' },
          { id: 4, key: 'role:manage', description: 'Gerir papéis' },
        ],
        createdAt: 'x',
        updatedAt: 'x',
      },
    ];

    it('agrupa o catálogo por recurso e salva o conjunto completo com PUT', async () => {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/admin/roles');
      await settle();

      flushAll(controller, url('roles'), ROLES);
      await settle();

      const text = textOf(host);
      expect(text).toContain('Candidato');
      expect(text).toContain('job:read');
      expect(text).toContain('application:create');
      expect(text).toContain('2 de 4 selecionadas');

      // marca uma permissão que o papel ainda não tinha
      const roleManage = checkboxByLabel(host, 'role:manage');
      expect(roleManage.checked).toBe(false);
      roleManage.checked = true;
      roleManage.dispatchEvent(new Event('change'));
      await settle();

      clickButton(host, 'Salvar permissões');
      const request = controller.expectOne(url('roles/1/permissions'));
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ permissionIds: [1, 2, 4] });
      request.flush({
        ...ROLES[0],
        permissions: [...ROLES[0].permissions, { id: 4, key: 'role:manage', description: null }],
      });
      await settle();

      expect(textOf(host)).toContain('3 de 4 selecionadas');
    });

    it('409 sem_papel_com_role_manage impede deixar o sistema sem gestor de papéis', async () => {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/admin/roles');
      await settle();
      flushAll(controller, url('roles'), ROLES);
      await settle();

      // seleciona o papel ADMIN e desmarca tudo
      const adminButton = [...host.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
        button.textContent?.includes('Administrador'),
      ) as HTMLButtonElement;
      adminButton.click();
      await settle();

      // limpa os dois grupos do catálogo (application e job) → conjunto vazio
      const clearButtons = allButtons(host).filter((button) => button.textContent?.trim() === 'limpar');
      expect(clearButtons.length).toBeGreaterThan(0);
      clearButtons.forEach((button) => button.click());
      await settle(router);

      clickButton(host, 'Salvar permissões');

      const request = controller.expectOne(url('roles/3/permissions'));
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ permissionIds: [] });
      request.flush(
        { statusCode: 409, reason: 'sem_papel_com_role_manage', message: 'sem gestor' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(textOf(host)).toContain('Pelo menos um papel precisa manter a permissão');
    });

    it('409 concorrencia_transacao é retryável e recarrega os papéis', async () => {
      const host = TestBed.createComponent(OutletHostComponent);
      host.autoDetectChanges();
      await router.navigateByUrl('/admin/roles');
      await settle();
      flushAll(controller, url('roles'), ROLES);
      await settle();

      const jobRead = checkboxByLabel(host, 'job:read');
      expect(jobRead.checked).toBe(true);
      jobRead.checked = false;
      jobRead.dispatchEvent(new Event('change'));
      await settle();

      clickButton(host, 'Salvar permissões');
      const saveRequest = controller.expectOne(url('roles/1/permissions'));
      expect(saveRequest.request.body).toEqual({ permissionIds: [2] });

      // O 409 de concorrência dispara um `load()` imediato: a recarga precisa
      // ser respondida antes de a tela sair do estado "Carregando papéis…".
      saveRequest.flush(
        { statusCode: 409, reason: 'concorrencia_transacao', message: 'conflito' },
        { status: 409, statusText: 'Conflict' },
      );
      flushAll(controller, url('roles'), ROLES);
      await settle();
      flushAll(controller, url('roles'), ROLES);
      await settle();

      expect(textOf(host)).toContain('Tente salvar de novo');
      expect(textOf(host)).toContain('Outra alteração de permissões estava em andamento');
    });
  });
});

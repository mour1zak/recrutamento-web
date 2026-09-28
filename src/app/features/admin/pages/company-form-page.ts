import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { formatDate, maskCnpj } from '../../../core/format';
import type { Company, Paginated, UserSummary } from '../../../core/models';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { ToastService } from '../../../core/toast.service';
import { CepFieldComponent, CepFieldState } from '../../../shared/forms/cep-field';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';
import { ModalComponent } from '../../../shared/ui/modal';
import { UsersService } from '../../../core/services/users.service';

/**
 * Criar (`POST /companies`) e editar (`PATCH /companies/:id`) empresa — a tela
 * do passo "admin cria empresa com CEP" do roteiro de apresentação.
 *
 * Regras espelhadas em `CreateCompanyDto`/`UpdateCompanyDto`:
 * - `name` obrigatório, máx. 160;
 * - `cnpj` opcional, 14 dígitos com ou sem máscara (único → `409
 *   cnpj_duplicado`);
 * - `description` opcional, máx. 500;
 * - `cep` obrigatório na criação, formato `00000-000`; se o provedor confirmar
 *   que não existe, o backend devolve `400 cep_nao_encontrado` (a UI já bloqueia
 *   antes, com a mesma mensagem); se o provedor estiver fora do ar, a empresa é
 *   criada mesmo assim com endereço vazio e `addressWarning` na resposta.
 */
@Component({
  selector: 'app-company-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AlertComponent,
    CepFieldComponent,
    LoadingComponent,
    ModalComponent,
  ],
  template: `
    <div class="page-header">
      <div class="page-header__titles">
        <h1>{{ isEdit() ? 'Editar empresa' : 'Nova empresa' }}</h1>
        <p class="page-header__subtitle mb-0">
          O endereço (logradouro, cidade e UF) é preenchido pelo backend a partir do CEP, via integração externa.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--sm" routerLink="/admin/companies">← Empresas</a>
      </div>
    </div>

    @if (loading()) {
      <app-loading label="Carregando empresa…" />
    } @else {
      @if (notFound()) {
        <app-alert [message]="notFound()" kind="error" />
      } @else {
        <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (company(); as current) {
            <div class="row row--between">
              <div>
                <span class="badge" [class.badge--success]="current.isActive" [class.badge--muted]="!current.isActive">
                  {{ current.isActive ? 'Ativa' : 'Desativada' }}
                </span>
                <span class="cell-sub" style="margin-left: 8px">
                  #{{ current.id }} · criada em {{ date(current.createdAt) }}
                </span>
              </div>
              <a class="btn btn--sm" [routerLink]="['/recruiter/stats']" [queryParams]="{ companyId: current.id }">
                Ver indicadores
              </a>
            </div>
            @if (!current.isActive) {
              <div class="alert alert--warning">
                <span class="alert__icon" aria-hidden="true">!</span>
                <div class="alert__body">
                  Empresa desativada. Reative-a na lista de empresas antes de editar.
                </div>
              </div>
            }
          }

          @if (formError()) {
            <app-alert [message]="formError()" kind="error" [detail]="formErrorDetail()" />
          }
          @if (addressWarning()) {
            <app-alert [message]="addressWarning()" kind="warning" />
          }
          @if (saveSuccess()) {
            <app-alert [message]="saveSuccess()" kind="success" />
          }

          <div class="field">
            <label class="field__label" for="name">Nome / razão social <span class="required">*</span></label>
            <input
              id="name"
              class="input"
              formControlName="name"
              placeholder="Tech Solutions Ltda"
              [class.input--invalid]="invalid('name')"
            />
            @if (invalid('name')) {
              <span class="field__error">{{ errorFor('name') }}</span>
            }
          </div>

          <div class="form-row">
            <div class="field">
              <label class="field__label" for="cnpj">CNPJ</label>
              <input
                id="cnpj"
                class="input"
                formControlName="cnpj"
                placeholder="12.345.678/0001-90"
                inputmode="numeric"
                (input)="onCnpjInput($event)"
                [class.input--invalid]="invalid('cnpj')"
              />
              <span class="field__hint">Opcional, mas único no sistema (14 dígitos).</span>
              @if (invalid('cnpj')) {
                <span class="field__error">CNPJ deve ter 14 dígitos (com ou sem máscara).</span>
              }
            </div>

            <app-cep-field
              formControlName="cep"
              [required]="!isEdit()"
              inputId="companyCep"
              (addressChange)="onCepState($event)"
              (blockedChange)="cepBlocked.set($event)"
            />
          </div>

          @if (addressPreview(); as preview) {
            <div class="alert alert--info">
              <span class="alert__icon" aria-hidden="true">i</span>
              <div class="alert__body">
                Endereço consultado: {{ preview }}
                <small>O endereço é confirmado e gravado automaticamente ao salvar.</small>
              </div>
            </div>
          }

          <div class="field">
            <label class="field__label" for="description">Descrição</label>
            <textarea
              id="description"
              class="textarea"
              formControlName="description"
              placeholder="O que a empresa faz, cultura, áreas que mais contratam…"
            ></textarea>
            <span class="field__hint">{{ form.controls.description.value.length }}/500</span>
          </div>

          <div class="row row--end">
            <a class="btn" routerLink="/admin/companies">Cancelar</a>
            <button
              type="submit"
              class="btn btn--primary"
              [disabled]="saving() || cepBlocked() || (isEdit() && !isActive())"
            >
              @if (saving()) {
                <span class="spinner" aria-hidden="true"></span>
                Salvando…
              } @else {
                {{ isEdit() ? 'Salvar alterações' : 'Criar empresa' }}
              }
            </button>
          </div>
          @if (cepBlocked()) {
            <span class="field__error">Corrija o CEP antes de salvar: o CEP informado não foi encontrado.</span>
          }
        </form>

        @if (isEdit() && company(); as current) {
          <section class="card mt-4">
            <div class="card__header">
              <div>
                <div class="card__title">Recrutadores desta empresa</div>
                <div class="card__hint">
                  Vincular um recrutador é o que coloca a empresa no ciclo da plataforma: com alguém vinculado, ela
                  passa a aparecer nas listas de empresas dos painéis de gestão.
                </div>
              </div>
              <button type="button" class="btn btn--sm btn--primary" (click)="openLink()" [disabled]="linkBusy()">
                Vincular recrutador
              </button>
            </div>

            @if (recruitersLoading()) {
              <app-loading label="Carregando recrutadores…" />
            } @else if (companyRecruiters().length > 0) {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Email</th>
                      <th>Situação</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (recruiter of companyRecruiters(); track recruiter.id) {
                      <tr>
                        <td class="cell-title">{{ recruiter.name }}</td>
                        <td>{{ recruiter.email }}</td>
                        <td>
                          @if (recruiter.isActive) {
                            <span class="badge badge--success">Ativo</span>
                          } @else {
                            <span class="badge badge--muted">Desativado</span>
                          }
                        </td>
                        <td class="actions">
                          <button
                            type="button"
                            class="btn btn--sm"
                            (click)="unlink(recruiter)"
                            [disabled]="linkBusy()"
                          >
                            Desvincular
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="muted mb-0">
                Nenhum recrutador vinculado. Enquanto for assim, esta empresa não aparece nas listas descobríveis da
                plataforma — vincule o primeiro recrutador para que ela entre no ciclo.
              </p>
            }
          </section>
        }

        @if (linkOpen()) {
          <app-modal
            title="Vincular recrutador"
            [subtitle]="company()?.name ?? ''"
            (closed)="linkOpen.set(false)"
          >
            <form class="form" [formGroup]="linkForm" (ngSubmit)="confirmLink()" novalidate>
              <div class="field">
                <label class="field__label" for="linkUserId">Recrutador</label>
                <select id="linkUserId" class="select" formControlName="userId">
                  <option [ngValue]="null">Selecione…</option>
                  @for (candidate of linkCandidates(); track candidate.id) {
                    <option [ngValue]="candidate.id">
                      {{ candidate.name }} — {{ candidate.email }}
                      @if (candidate.companyId) {
                        (hoje na empresa #{{ candidate.companyId }})
                      }
                    </option>
                  }
                </select>
                <span class="field__hint">
                  Usuários com papel de recrutador. Vincular aqui move o recrutador da empresa anterior para esta.
                </span>
              </div>

              @if (linkError()) {
                <app-alert [message]="linkError()" kind="error" />
              }

              <div class="modal__footer">
                <button type="button" class="btn" (click)="linkOpen.set(false)">Cancelar</button>
                <button
                  type="submit"
                  class="btn btn--primary"
                  [disabled]="linkBusy() || linkForm.controls.userId.value === null"
                >
                  @if (linkBusy()) {
                    <span class="spinner" aria-hidden="true"></span>
                  }
                  Vincular
                </button>
              </div>
            </form>
          </app-modal>
        }
      }
    }
  `,
})
export class CompanyFormPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly companiesService = inject(CompaniesService);
  private readonly directory = inject(CompanyDirectoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly usersService = inject(UsersService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly company = signal<Company | null>(null);
  protected readonly notFound = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly formErrorDetail = signal<string | null>(null);
  private readonly addressWarningSignal = signal<string | null>(null);
  /** Aviso de CEP não confirmado: sobrevive à recarga da empresa (é um estado
   *  do registro, não só da última gravação). */
  protected readonly addressWarning = computed(
    () => this.addressWarningSignal() ?? this.company()?.addressWarning ?? null,
  );
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly cepBlocked = signal(false);

  /** Última navegação disparada (exposta para testes aguardarem). */
  navigation: Promise<boolean> | null = null;
  protected readonly addressPreview = signal<string | null>(null);

  protected readonly companyId = signal<number | null>(null);

  // Gestão de recrutadores da empresa (somente no modo edição): usa apenas
  // rotas existentes — GET /users?companyId=:id, GET /users?role=RECRUITER e
  // PATCH /users/:id/company. É o caminho natural para uma empresa nova entrar
  // no ciclo descobrível, sem código digitado e sem lista inventada.
  protected readonly companyRecruiters = signal<UserSummary[]>([]);
  protected readonly recruitersLoading = signal(false);
  protected readonly linkOpen = signal(false);
  protected readonly linkCandidates = signal<UserSummary[]>([]);
  protected readonly linkError = signal<string | null>(null);
  protected readonly linkBusy = signal(false);
  protected readonly linkForm = this.fb.group({ userId: this.fb.control<number | null>(null) });
  protected readonly isEdit = computed(() => this.companyId() !== null);
  protected readonly isActive = computed(() => this.company()?.isActive ?? true);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(160)]),
    cnpj: this.fb.control('', [Validators.pattern(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)]),
    description: this.fb.control('', [Validators.maxLength(500)]),
    cep: this.fb.control('', [Validators.pattern(/^\d{5}-?\d{3}$/)]),
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;
    this.companyId.set(id && Number.isFinite(id) ? id : null);

    if (this.isEdit()) {
      this.companiesService
        .get(id as number)
        .pipe(take(1))
        .subscribe({
          next: (company) => {
            this.company.set(company);
            this.form.patchValue({
              name: company.name,
              cnpj: company.cnpj ?? '',
              description: company.description ?? '',
              cep: company.cep ?? '',
            });
            this.addressPreview.set(this.previewFrom(company));
            this.loading.set(false);
          },
          error: (apiError: ApiError) => {
            this.loading.set(false);
            this.notFound.set(apiError.status === 404 ? 'Empresa não encontrada (ou desativada).' : apiError.message);
          },
        });
      this.loadRecruiters(id as number);
    } else {
      this.loading.set(false);
    }
  }

  protected invalid(control: 'name' | 'cnpj'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.dirty || field.touched || this.saving());
  }

  protected errorFor(control: 'name' | 'cnpj'): string {
    const field = this.form.controls[control];
    if (field.hasError('required')) return 'Campo obrigatório.';
    if (field.hasError('maxlength')) return 'Texto longo demais (máx. 160).';
    return 'Valor inválido.';
  }

  protected onCnpjInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const masked = maskCnpj(input.value);
    input.value = masked;
    this.form.controls.cnpj.setValue(masked);
  }

  protected onCepState(state: CepFieldState | null): void {
    if (!state) return;
    const parts = [state.street, state.city, state.state].filter(Boolean);
    this.addressPreview.set(parts.length > 0 ? parts.join(' — ') : null);
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }

  protected submit(): void {
    if (this.saving()) return;

    this.formError.set(null);
    this.formErrorDetail.set(null);
    this.addressWarningSignal.set(null);
    this.saveSuccess.set(null);

    const cepRequired = !this.isEdit();
    if (cepRequired && this.form.controls.cep.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Informe um CEP válido (formato 00000-000).');
      return;
    }
    if (this.cepBlocked()) {
      this.formError.set('CEP não encontrado, verifique e tente novamente.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Confira os campos destacados.');
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      name: value.name.trim(),
      cnpj: value.cnpj?.trim() ? value.cnpj.trim() : undefined,
      description: value.description?.trim() ?? undefined,
      cep: value.cep?.trim() ? value.cep.trim() : undefined,
    };

    this.saving.set(true);
    // Capturado ANTES de mutar qualquer signal: `isEdit()` deriva de
    // `companyId()`, que é preenchido com o id da empresa recém-criada.
    const editing = this.isEdit();
    const request = editing
      ? this.companiesService.update(this.companyId() as number, payload)
      : this.companiesService.create({ ...payload, cep: payload.cep as string });

    request.pipe(take(1)).subscribe({
      next: (company) => {
        this.saving.set(false);
        this.company.set(company);
        this.companyId.set(company.id);
        // Entra já no cache/lista da sessão: aparece no seletor de empresa do
        // formulário de vaga e na lista do admin sem precisar recarregar nada.
        this.directory.register(company);
        this.addressPreview.set(this.previewFrom(company));

        this.addressWarningSignal.set(company.addressWarning ?? null);
        this.saveSuccess.set(editing ? 'Empresa atualizada.' : 'Empresa criada.');
        this.toasts.success(editing ? 'Empresa atualizada.' : `Empresa "${company.name}" criada.`);

        if (!editing) {
          // Continua na mesma tela, agora em modo edição (URL canônica).
          this.navigation = this.router.navigate(['/admin/companies', company.id, 'edit']);
        }
      },
      error: (apiError: ApiError) => {
        this.saving.set(false);
        this.formError.set(apiError.message);
        this.formErrorDetail.set(apiError.fieldErrors?.join(' • ') ?? null);
      },
    });
  }

  private loadRecruiters(companyId: number): void {
    this.recruitersLoading.set(true);
    this.usersService
      .list({ companyId, page: 1, limit: 100 })
      .pipe(take(1), catchError(() => of<Paginated<UserSummary> | null>(null)))
      .subscribe((page) => {
        this.recruitersLoading.set(false);
        this.companyRecruiters.set(page?.data ?? []);
      });
  }

  protected openLink(): void {
    this.linkError.set(null);
    this.linkForm.reset({ userId: null });
    this.linkOpen.set(true);
    this.usersService
      .list({ role: 'RECRUITER', page: 1, limit: 100 })
      .pipe(take(1), catchError(() => of<Paginated<UserSummary> | null>(null)))
      .subscribe((page) => this.linkCandidates.set(page?.data ?? []));
  }

  protected confirmLink(): void {
    const userId = this.linkForm.getRawValue().userId;
    const companyId = this.companyId();
    if (!userId || !companyId || this.linkBusy()) return;

    this.linkBusy.set(true);
    this.linkError.set(null);
    this.usersService
      .changeCompany(userId, companyId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.linkBusy.set(false);
          this.linkOpen.set(false);
          this.toasts.success('Recrutador vinculado.', 'Com ele vinculado, a empresa entra nas listas descobríveis.');
          this.loadRecruiters(companyId);
        },
        error: (apiError: ApiError) => {
          this.linkBusy.set(false);
          this.linkError.set(apiError.message);
        },
      });
  }

  protected unlink(recruiter: UserSummary): void {
    const companyId = this.companyId();
    if (!companyId || this.linkBusy()) return;

    this.linkBusy.set(true);
    this.usersService
      .changeCompany(recruiter.id, null)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.linkBusy.set(false);
          this.toasts.success(`${recruiter.name} foi desvinculado desta empresa.`);
          this.loadRecruiters(companyId);
        },
        error: (apiError: ApiError) => {
          this.linkBusy.set(false);
          this.linkError.set(apiError.message);
        },
      });
  }

  private previewFrom(company: Company): string | null {
    const parts = [company.street, company.city, company.state].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : null;
  }
}

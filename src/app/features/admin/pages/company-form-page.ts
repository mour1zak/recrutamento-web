import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { formatDate, maskCnpj } from '../../../core/format';
import type { Company } from '../../../core/models';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { ToastService } from '../../../core/toast.service';
import { CepFieldComponent, CepFieldState } from '../../../shared/forms/cep-field';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';

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
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, CepFieldComponent, LoadingComponent],
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

  private previewFrom(company: Company): string | null {
    const parts = [company.street, company.city, company.state].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : null;
  }
}

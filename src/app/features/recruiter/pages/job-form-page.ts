import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionsService } from '../../../core/auth/permissions.service';
import { formatSalary } from '../../../core/format';
import type { Company, ScopedJob } from '../../../core/models';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';

/**
 * Criar (`POST /jobs`) e editar (`PATCH /jobs/:id`) vaga — mesma tela, dois modos.
 *
 * Regras espelhadas nos DTOs do backend:
 * - `title` obrigatório, máx. 160;
 * - `description` obrigatória, máx. 4000;
 * - `vacancies` inteiro ≥ 1 (na edição não pode ficar abaixo de `filledCount`
 *   → o backend responde `409 vacancies_below_filled_count`, traduzido aqui);
 * - `salaryMin`/`salaryMax` inteiros ≥ 0 (máx. 100 milhões) — opcionais, e por
 *   isso NÃO são enviados quando vazios (`forbidNonWhitelisted` no backend);
 * - `isRemote` booleano obrigatório;
 * - `companyId`: obrigatório quando quem cria é ADMIN (que não tem empresa
 *   própria); ignorado para RECRUITER (o backend usa a empresa dele).
 *
 * A vaga nasce `DRAFT`: publicar é uma mudança de status feita em "Minhas vagas".
 */
@Component({
  selector: 'app-job-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, AlertComponent, LoadingComponent],
  template: `
    <div class="container page container--narrow">
      <div class="page-header">
        <div class="page-header__titles">
          <h1>{{ isEdit() ? 'Editar vaga' : 'Nova vaga' }}</h1>
          <p class="page-header__subtitle mb-0">
            {{
              isEdit()
                ? 'Altere os dados da vaga. Mudanças de status (publicar, pausar, encerrar) são feitas na lista de vagas.'
                : 'A vaga é criada como rascunho. Publique em "Minhas vagas" para que os candidatos a vejam.'
            }}
          </p>
        </div>
        <div class="page-header__actions">
          <a class="btn btn--sm" routerLink="/recruiter/jobs">← Minhas vagas</a>
        </div>
      </div>

      @if (loading()) {
        <app-loading label="Carregando vaga…" />
      } @else {
        <form class="card form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (formError()) {
            <app-alert [message]="formError()" kind="error" [detail]="formErrorDetail()" />
          }
          @if (notFoundError()) {
            <app-alert [message]="notFoundError()" kind="error" />
          }

          <div class="field">
            <label class="field__label" for="title">Título da vaga <span class="required">*</span></label>
            <input
              id="title"
              class="input"
              formControlName="title"
              placeholder="Ex.: Desenvolvedor(a) Backend Node.js"
              [class.input--invalid]="invalid('title')"
            />
            @if (invalid('title')) {
              <span class="field__error">{{ errorFor('title') }}</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="description">Descrição <span class="required">*</span></label>
            <textarea
              id="description"
              class="textarea"
              formControlName="description"
              placeholder="Responsabilidades, requisitos, stack, modelo de contratação…"
              [class.textarea--invalid]="invalid('description')"
              style="min-height: 180px"
            ></textarea>
            <span class="field__hint">{{ form.controls.description.value.length }}/4000</span>
            @if (invalid('description')) {
              <span class="field__error">{{ errorFor('description') }}</span>
            }
          </div>

          <div class="form-row form-row--3">
            <div class="field">
              <label class="field__label" for="vacancies">Posições <span class="required">*</span></label>
              <input
                id="vacancies"
                class="input"
                type="number"
                min="1"
                step="1"
                formControlName="vacancies"
                [class.input--invalid]="invalid('vacancies')"
              />
              @if (job(); as current) {
                <span class="field__hint">{{ current.filledCount }} já contratada(s).</span>
              }
              @if (invalid('vacancies')) {
                <span class="field__error">{{ errorFor('vacancies') }}</span>
              }
            </div>

            <div class="field">
              <label class="field__label" for="salaryMin">Salário mínimo (R$)</label>
              <input id="salaryMin" class="input" type="number" min="0" step="1" formControlName="salaryMin" />
            </div>

            <div class="field">
              <label class="field__label" for="salaryMax">Salário máximo (R$)</label>
              <input id="salaryMax" class="input" type="number" min="0" step="1" formControlName="salaryMax" />
              @if (salaryRangeError()) {
                <span class="field__error">{{ salaryRangeError() }}</span>
              }
            </div>
          </div>

          <label class="checkbox">
            <input type="checkbox" formControlName="isRemote" />
            Vaga remota
          </label>

          @if (isAdmin()) {
            <div class="field">
              <span class="field__label">Empresa dona da vaga <span class="required">*</span></span>
              @if (companyMode() === 'list') {
                <select id="companyId" class="select" formControlName="companyId" [disabled]="isEdit()" (change)="onCompanySelectChange($event)">
                  <option [ngValue]="null">Selecione…</option>
                  @for (company of companies(); track company.id) {
                    <option [ngValue]="company.id">{{ company.name }} (#{{ company.id }})</option>
                  }
                  <option value="manual">Outra empresa (informar o código)…</option>
                </select>
              } @else {
                <div class="input-group">
                  <input
                    id="companyIdManual"
                    class="input"
                    type="number"
                    min="1"
                    step="1"
                    formControlName="manualCompanyId"
                    placeholder="Código da empresa (ex.: 14)"
                    [disabled]="isEdit()"
                  />
                  <button type="button" class="btn" (click)="backToListMode()" [disabled]="isEdit()">Usar a lista</button>
                </div>
              }
              <span class="field__hint">
                Administradores criam vaga para qualquer empresa; recrutadores criam sempre na própria. A lista mostra
                as empresas descobríveis; uma empresa recém-criada entra pelo código (coluna "#" da tela de Empresas).
                @if (isEdit()) {
                  A empresa dona de uma vaga existente não pode ser trocada.
                }
              </span>
              @if (invalid('companyId')) {
                <span class="field__error">Selecione a empresa ou informe o código.</span>
              }
            </div>
          }

          <div class="row row--end">
            <a class="btn" routerLink="/recruiter/jobs">Cancelar</a>
            <button type="submit" class="btn btn--primary" [disabled]="saving() || !!salaryRangeError()">
              @if (saving()) {
                <span class="spinner" aria-hidden="true"></span>
                Salvando…
              } @else {
                {{ isEdit() ? 'Salvar alterações' : 'Criar vaga (rascunho)' }}
              }
            </button>
          </div>

          @if (job(); as current) {
            <p class="field__hint mb-0">Salário exibido hoje na vitrine: {{ preview(current) }}</p>
          }
        </form>
      }
    </div>
  `,
})
export class JobFormPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly jobsService = inject(JobsService);
  private readonly companiesDirectory = inject(CompanyDirectoryService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly job = signal<ScopedJob | null>(null);
  protected readonly companies = signal<Company[]>([]);
  protected readonly formError = signal<string | null>(null);
  protected readonly formErrorDetail = signal<string | null>(null);
  protected readonly notFoundError = signal<string | null>(null);
  protected readonly salaryRangeError = signal<string | null>(null);

  protected readonly jobId = signal<number | null>(null);
  protected readonly isEdit = computed(() => this.jobId() !== null);
  protected readonly isAdmin = computed(() => this.permissions.isAdmin());

  protected readonly form = this.fb.group({
    title: this.fb.control('', [Validators.required, Validators.maxLength(160)]),
    description: this.fb.control('', [Validators.required, Validators.maxLength(4000)]),
    vacancies: this.fb.control<number>(1, [Validators.required, Validators.min(1)]),
    salaryMin: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100_000_000)]),
    salaryMax: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100_000_000)]),
    isRemote: this.fb.control(false, [Validators.required]),
    companyId: this.fb.control<number | null | string>(null),
    manualCompanyId: this.fb.control<number | null>(null),
  });
  protected readonly companyMode = signal<'list' | 'manual'>('list');

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('jobId');
    const id = idParam ? Number(idParam) : null;
    this.jobId.set(id && Number.isFinite(id) ? id : null);

    if (this.isAdmin()) {
      this.companiesDirectory
        .discoverCompanies()
        .pipe(
          take(1),
          catchError(() => of<Company[]>([])),
        )
        .subscribe((companies) => {
          this.companies.set(companies);
        });
    }

    if (this.isEdit()) {
      this.jobsService
        .getJob(id as number)
        .pipe(take(1))
        .subscribe({
          next: (job) => {
            this.job.set(job);
            this.form.patchValue({
              title: job.title,
              description: job.description,
              vacancies: job.vacancies,
              salaryMin: job.salaryMin,
              salaryMax: job.salaryMax,
              isRemote: job.isRemote,
              companyId: job.companyId,
            });
            this.loading.set(false);
          },
          error: (apiError: ApiError) => {
            this.loading.set(false);
            this.notFoundError.set(
              apiError.status === 404 || apiError.status === 403
                ? 'Vaga não encontrada (ou fora do escopo da sua empresa).'
                : apiError.message,
            );
          },
        });
    } else {
      // Recrutador: já deixa a empresa própria pré-carregada (só informativa).
      this.auth
        .ownCompanyOnce()
        .pipe(take(1))
        .subscribe(() => this.loading.set(false));
    }
  }

  protected onCompanySelectChange(event: Event): void {
    if ((event.target as HTMLSelectElement).value === 'manual') {
      this.companyMode.set('manual');
      this.form.controls.companyId.setValue(null);
    }
  }

  protected backToListMode(): void {
    this.companyMode.set('list');
    this.form.controls.manualCompanyId.setValue(null);
  }

  protected invalid(control: 'title' | 'description' | 'vacancies' | 'companyId'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.dirty || field.touched || this.saving());
  }

  protected errorFor(control: 'title' | 'description' | 'vacancies' | 'companyId'): string {
    const field = this.form.controls[control];
    if (field.hasError('required')) return 'Campo obrigatório.';
    if (field.hasError('min')) return 'Informe um número inteiro maior ou igual a 1.';
    if (field.hasError('maxlength')) return 'Texto longo demais.';
    return 'Valor inválido.';
  }

  protected preview(job: ScopedJob): string {
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  protected submit(): void {
    if (this.saving()) return;
    this.formError.set(null);
    this.formErrorDetail.set(null);
    this.salaryRangeError.set(null);

    const value = this.form.getRawValue();
    const min = value.salaryMin;
    const max = value.salaryMax;
    if (min !== null && max !== null && min > max) {
      this.salaryRangeError.set('O salário máximo deve ser maior ou igual ao mínimo.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Confira os campos destacados.');
      return;
    }

    let companyId: number | null = null;
    if (this.isAdmin() && !this.isEdit()) {
      if (this.companyMode() === 'manual') {
        const manual = value.manualCompanyId;
        if (manual === null || !Number.isInteger(manual) || manual < 1) {
          this.formError.set('Informe o código numérico da empresa dona da vaga.');
          return;
        }
        companyId = manual;
      } else {
        companyId = value.companyId === 'manual' ? null : (value.companyId as number | null);
      }
      if (!companyId) {
        this.formError.set('Selecione a empresa dona da vaga (ou informe o código).');
        return;
      }
    }

    this.saving.set(true);

    const payload = {
      title: value.title.trim(),
      description: value.description.trim(),
      vacancies: Number(value.vacancies),
      isRemote: Boolean(value.isRemote),
      salaryMin: value.salaryMin === null ? undefined : Number(value.salaryMin),
      salaryMax: value.salaryMax === null ? undefined : Number(value.salaryMax),
    };

    const request = this.isEdit()
      ? this.jobsService.updateJob(this.jobId() as number, payload)
      : this.jobsService.createJob({
          ...payload,
          companyId: this.isAdmin() ? companyId : undefined,
        });

    request.pipe(take(1)).subscribe({
      next: (job) => {
        this.saving.set(false);
        this.toasts.success(
          this.isEdit() ? 'Vaga atualizada.' : 'Vaga criada como rascunho.',
          this.isEdit() ? undefined : 'Publique em "Minhas vagas" → Status → Aberta.',
        );
        void this.router.navigate(['/recruiter/jobs', job.id]);
      },
      error: (apiError: ApiError) => {
        this.saving.set(false);
        this.formError.set(apiError.message);
        this.formErrorDetail.set(apiError.fieldErrors?.join(' • ') ?? null);
      },
    });
  }
}

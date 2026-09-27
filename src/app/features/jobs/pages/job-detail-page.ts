import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, from, map, of, switchMap, take, throwError } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionsService, PERMISSIONS } from '../../../core/auth/permissions.service';
import {
  APPLICATION_STATUS_LABEL,
  JOB_STATUS_LABEL,
  formatBytes,
  formatDate,
  formatSalary,
} from '../../../core/format';
import type { ApplicationStatus, DocumentSummary, JobStatus, PublicJob, ScopedJob } from '../../../core/models';
import { ApplicationsService } from '../../../core/services/applications.service';
import { DocumentsService } from '../../../core/services/documents.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';
import { ModalComponent } from '../../../shared/ui/modal';

type JobView = PublicJob | ScopedJob;

function isScoped(job: JobView): job is ScopedJob {
  return 'companyId' in job;
}

/**
 * Detalhe da vaga + candidatura (o coração do fluxo do candidato).
 *
 * Contrato importante: `GET /jobs/:id` exige JWT. Visitante anônimo resolve a
 * vaga pela vitrine pública (`GET /jobs`, que é `@Public()`), então o link
 * compartilhado funciona mesmo deslogado — e o botão de candidatar pede login.
 */
@Component({
  selector: 'app-job-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, LoadingComponent, ModalComponent],
  template: `
    @if (loading()) {
      <app-loading label="Carregando vaga…" />
    } @else if (loadError()) {
      <div class="container page">
        <app-alert [message]="loadError()" kind="error" />
        <p class="mt-4"><a routerLink="/jobs">← Voltar para a vitrine de vagas</a></p>
      </div>
    } @else {
      @if (job(); as job) {
        <div class="container page">
          <a class="muted" routerLink="/jobs">← Todas as vagas</a>

          <div class="grid grid--sidebar mt-4">
            <div class="stack">
              <article class="card">
                <div class="card__header">
                  <div>
                    <h1>{{ job.title }}</h1>
                    <p class="muted mb-0">{{ job.company.name }}</p>
                  </div>
                  <span
                    class="badge"
                    [class.badge--success]="job.status === 'OPEN'"
                    [class.badge--muted]="job.status !== 'OPEN'"
                  >
                    {{ statusLabel(job.status) }}
                  </span>
                </div>

                <dl class="facts">
                  <div>
                    <dt>Regime</dt>
                    <dd>{{ job.isRemote ? 'Remoto' : 'Presencial' }}</dd>
                  </div>
                  <div>
                    <dt>Faixa salarial</dt>
                    <dd>{{ salary(job) }}</dd>
                  </div>
                  <div>
                    <dt>Posições</dt>
                    <dd>{{ job.vacancies }}</dd>
                  </div>
                  <div>
                    <dt>Publicada em</dt>
                    <dd>{{ published(job) }}</dd>
                  </div>
                </dl>

                <hr class="divider" />

                <div class="section-title">Descrição da vaga</div>
                <p class="preserve-lines mb-0">{{ job.description }}</p>
              </article>

              @if (canManageJob()) {
                <div class="card card--tight">
                  <div class="row row--between">
                    <div>
                      <div class="card__title">Gestão desta vaga</div>
                      <div class="card__hint">
                        Você tem acesso de {{ permissions.isAdmin() ? 'administrador' : 'recrutador' }}
                        @if (scopedJob(); as scoped) {
                          · {{ scoped.filledCount }} de {{ scoped.vacancies }} posição(ões) preenchida(s)
                        }
                      </div>
                    </div>
                    <div class="btn-group">
                      <a class="btn btn--sm" [routerLink]="['/recruiter/jobs', job.id]">Candidaturas</a>
                      <a class="btn btn--sm" [routerLink]="['/recruiter/jobs', job.id, 'edit']">Editar vaga</a>
                    </div>
                  </div>
                </div>
              }
            </div>

            <aside class="stack">
              <div class="card">
                <div class="section-title">Candidatura</div>

                @if (appliedApplication(); as application) {
                  <div class="alert alert--success mb-3">
                    <span class="alert__icon" aria-hidden="true">✓</span>
                    <div class="alert__body">
                      Você já se candidatou a esta vaga.
                      <small>Status atual: {{ applicationStatusLabel(application.status) }}</small>
                    </div>
                  </div>
                  <a class="btn btn--block" [routerLink]="['/candidate/applications', application.id]">
                    Ver minha candidatura
                  </a>
                } @else if (!auth.isAuthenticated()) {
                  <p class="card__hint">Entre na sua conta de candidato para se candidatar a esta vaga.</p>
                  <a
                    class="btn btn--primary btn--block"
                    [routerLink]="['/auth/login']"
                    [queryParams]="{ returnUrl: currentUrl() }"
                  >
                    Entrar para se candidatar
                  </a>
                  <a class="btn btn--block" routerLink="/auth/register">Criar conta gratuita</a>
                } @else if (!canApply()) {
                  <div class="alert alert--info">
                    <span class="alert__icon" aria-hidden="true">i</span>
                    <div class="alert__body">
                      Apenas perfis de candidato podem se candidatar. Você está logado como
                      {{ roleText() }}.
                    </div>
                  </div>
                } @else if (job.status !== 'OPEN') {
                  <div class="alert alert--warning">
                    <span class="alert__icon" aria-hidden="true">!</span>
                    <div class="alert__body">Esta vaga não está aberta para candidaturas no momento.</div>
                  </div>
                } @else {
                  <p class="card__hint">Envie uma carta de apresentação (opcional) e escolha qual currículo anexar.</p>
                  <button type="button" class="btn btn--primary btn--block" (click)="openApply()">Candidatar-se</button>
                  @if (resumes().length === 0 && !documentsLoading()) {
                    <p class="field__hint mt-4 mb-0">
                      Você ainda não anexou nenhum currículo.
                      <a routerLink="/candidate/profile">Enviar currículo agora</a>
                      — dá para se candidatar mesmo assim, sem anexo.
                    </p>
                  }
                }

                @if (applyError()) {
                  <div class="mt-4"><app-alert [message]="applyError()" kind="error" /></div>
                }
              </div>

              <div class="card card--tight">
                <div class="section-title">Sobre a empresa</div>
                <div class="strong">{{ job.company.name }}</div>
                <p class="card__hint mb-0">
                  As informações de endereço e descrição da empresa ficam disponíveis para candidatos com candidatura em
                  andamento.
                </p>
              </div>
            </aside>
          </div>
        </div>

        @if (applyOpen()) {
          <app-modal title="Candidatar-se à vaga" [subtitle]="job.title" (closed)="closeApply()">
            <form class="form" [formGroup]="applyForm" (ngSubmit)="submitApplication()" novalidate>
              <div class="field">
                <label class="field__label" for="coverLetter">Carta de apresentação</label>
                <textarea
                  id="coverLetter"
                  class="textarea"
                  formControlName="coverLetter"
                  placeholder="Conte brevemente por que você é uma boa escolha para esta vaga (opcional, até 2000 caracteres)."
                  [class.textarea--invalid]="applyForm.controls.coverLetter.invalid"
                ></textarea>
                <span class="field__hint">
                  {{ applyForm.controls.coverLetter.value.length }}/2000
                  @if (applyForm.controls.coverLetter.invalid) {
                    · limite excedido
                  }
                </span>
              </div>

              <div class="field">
                <label class="field__label" for="resume">Currículo anexado</label>
                <select id="resume" class="select" formControlName="resumeDocumentId">
                  <option [ngValue]="null">Sem anexo</option>
                  @for (document of resumes(); track document.id) {
                    <option [ngValue]="document.id">
                      {{ document.originalName }} · {{ size(document.sizeBytes) }} · enviado em
                      {{ date(document.createdAt) }}
                    </option>
                  }
                </select>
                <span class="field__hint">
                  Só aparecem aqui os currículos que você enviou (PDF, DOC ou DOCX até 5 MB). O recrutador só consegue
                  baixar o arquivo anexado à candidatura.
                </span>
              </div>

              @if (resumes().length === 0) {
                <div class="alert alert--info">
                  <span class="alert__icon" aria-hidden="true">i</span>
                  <div class="alert__body">
                    Nenhum currículo cadastrado ainda.
                    <a routerLink="/candidate/profile" (click)="closeApply()">Anexar currículo no meu perfil</a>
                  </div>
                </div>
              }

              <div class="modal__footer">
                <button type="button" class="btn" (click)="closeApply()">Cancelar</button>
                <button type="submit" class="btn btn--primary" [disabled]="submitting()">
                  @if (submitting()) {
                    <span class="spinner" aria-hidden="true"></span>
                    Enviando…
                  } @else {
                    Confirmar candidatura
                  }
                </button>
              </div>
            </form>
          </app-modal>
        }
      }
    }
  `,
  styles: [
    `
      .facts {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--space-4);
        margin: 0;
      }

      .facts dt {
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-subtle);
        font-weight: 700;
      }

      .facts dd {
        margin: 2px 0 0;
        font-weight: 600;
      }

      @media (max-width: 720px) {
        .facts {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class JobDetailPageComponent {
  private readonly jobsService = inject(JobsService);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly documentsService = inject(DocumentsService);
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly permissions = inject(PermissionsService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly job = signal<JobView | null>(null);
  protected readonly scopedJob = signal<ScopedJob | null>(null);

  protected readonly resumes = signal<DocumentSummary[]>([]);
  protected readonly documentsLoading = signal(false);

  protected readonly appliedApplication = signal<{ id: number; status: ApplicationStatus } | null>(null);

  protected readonly applyOpen = signal(false);
  protected readonly submitting = signal(false);
  protected readonly applyError = signal<string | null>(null);

  protected readonly applyForm = this.fb.group({
    coverLetter: this.fb.control('', [Validators.maxLength(2000)]),
    resumeDocumentId: this.fb.control<number | null>(null),
  });

  protected readonly canApply = computed(() => this.permissions.can(PERMISSIONS.APPLICATION_CREATE));
  protected readonly canManageJob = computed(() =>
    this.permissions.canAny(PERMISSIONS.JOB_READ_ANY, PERMISSIONS.APPLICATION_READ_JOB),
  );
  protected readonly currentUrl = computed(() => this.router.url);
  protected readonly roleText = computed(() => {
    switch (this.auth.role()) {
      case 'ADMIN':
        return 'administrador';
      case 'RECRUITER':
        return 'recrutador';
      default:
        return 'candidato';
    }
  });

  private jobId = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(),
        switchMap((params) => {
          const id = Number(params.get('id'));
          this.jobId = id;
          this.loading.set(true);
          this.loadError.set(null);
          return this.resolveJob(id);
        }),
      )
      .subscribe({
        next: (job) => {
          this.job.set(job);
          this.scopedJob.set(isScoped(job) ? job : null);
          this.loading.set(false);
          this.afterJobLoaded();
        },
        error: () => {
          this.loading.set(false);
          this.job.set(null);
          this.loadError.set('Vaga não encontrada.');
        },
      });
  }

  /**
   * Tenta a rota autenticada e, se não houver sessão (401) ou a vaga não
   * estiver no escopo do usuário (404), cai para a vitrine pública.
   */
  private resolveJob(id: number) {
    if (!this.auth.isAuthenticated()) return this.findInPublicList(id);

    return this.jobsService.getJob(id).pipe(
      catchError((error: ApiError) => {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          return this.findInPublicList(id);
        }
        return throwError(() => error);
      }),
    );
  }

  private findInPublicList(id: number) {
    // `GET /jobs` lista apenas vagas OPEN de empresas ativas — suficiente para
    // a vitrine pública e para links compartilhados.
    return this.jobsService.listPublicJobs({ page: 1, limit: 100 }).pipe(
      switchMap((page) => {
        const found = page.data.find((job) => job.id === id);
        if (found) return of(found);
        if (page.total <= page.limit) return throwError(() => new Error('job_not_found'));
        // Procura nas páginas seguintes (raro: só com mais de 100 vagas abertas).
        const pages = Math.min(Math.ceil(page.total / 100), 5);
        return from(Array.from({ length: pages - 1 }, (_, index) => index + 2)).pipe(
          concatMap((pageNumber) => this.jobsService.listPublicJobs({ page: pageNumber, limit: 100 })),
          map((nextPage) => nextPage.data.find((job) => job.id === id)),
          catchError(() => of(undefined)),
          switchMap((foundLater) => (foundLater ? of(foundLater) : throwError(() => new Error('job_not_found')))),
        );
      }),
    );
  }

  private afterJobLoaded(): void {
    if (!this.auth.isAuthenticated()) return;

    // Já se candidatou? (evita o 409 candidatura_duplicada por clique)
    this.applicationsService
      .listMine({ page: 1, limit: 100 })
      .pipe(
        take(1),
        catchError(() => of(null)),
      )
      .subscribe((page) => {
        const match = page?.data.find((application) => application.jobId === this.jobId);
        this.appliedApplication.set(match ? { id: match.id, status: match.status } : null);
      });

    if (this.canApply()) {
      this.documentsLoading.set(true);
      this.documentsService
        .listMine()
        .pipe(
          take(1),
          catchError(() => of([] as DocumentSummary[])),
        )
        .subscribe((documents) => {
          this.resumes.set(documents.filter((document) => document.type === 'RESUME'));
          this.documentsLoading.set(false);
        });
    }
  }

  protected openApply(): void {
    this.applyError.set(null);
    this.applyForm.reset({ coverLetter: '', resumeDocumentId: this.resumes()[0]?.id ?? null });
    this.applyOpen.set(true);
  }

  protected closeApply(): void {
    this.applyOpen.set(false);
  }

  protected submitApplication(): void {
    if (this.submitting()) return;
    this.applyError.set(null);

    if (this.applyForm.invalid) {
      this.applyForm.markAllAsTouched();
      return;
    }

    const { coverLetter, resumeDocumentId } = this.applyForm.getRawValue();
    this.submitting.set(true);

    this.applicationsService
      .create(this.jobId, { coverLetter: coverLetter?.trim() || undefined, resumeDocumentId })
      .pipe(take(1))
      .subscribe({
        next: (application) => {
          this.submitting.set(false);
          this.applyOpen.set(false);
          this.appliedApplication.set({ id: application.id, status: application.status });
          this.toasts.success('Candidatura enviada!', 'Acompanhe o status em "Minhas candidaturas".');
          void this.router.navigate(['/candidate/applications', application.id]);
        },
        error: (error: ApiError) => {
          this.submitting.set(false);
          this.applyError.set(error.message);
          if (error.reason === 'candidatura_duplicada') {
            this.afterJobLoaded();
          }
        },
      });
  }

  protected statusLabel(status: JobStatus): string {
    return JOB_STATUS_LABEL[status] ?? status;
  }

  protected applicationStatusLabel(status: ApplicationStatus): string {
    return APPLICATION_STATUS_LABEL[status] ?? status;
  }

  protected salary(job: JobView): string {
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  protected published(job: JobView): string {
    return formatDate(job.createdAt);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }
}

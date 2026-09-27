import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, materialize, of, switchMap, take, tap } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionsService, PERMISSIONS } from '../../../core/auth/permissions.service';
import { APPLICATION_STATUS_LABEL, JOB_STATUS_LABEL, formatDateTime, formatSalary } from '../../../core/format';
import type {
  Application,
  ApplicationStatus,
  CandidateProfile,
  Interview,
  JobStatus,
  Paginated,
  ScopedJob,
} from '../../../core/models';
import { APPLICATION_STATUS, isFullApplication, isFullProfile } from '../../../core/models';
import { ApplicationsService } from '../../../core/services/applications.service';
import { CandidateProfileService } from '../../../core/services/candidate-profile.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { PaginationComponent } from '../../../shared/ui/pagination';
import { ApplicationStatusBadgeComponent, JobStatusBadgeComponent } from '../../../shared/ui/status-badges';
import { ApplicationReviewComponent } from '../components/application-review';
import { CandidateCardComponent } from '../components/candidate-card';

/**
 * Candidaturas de uma vaga (`GET /jobs/:jobId/applications`) — a tela de
 * avaliação do recrutador.
 *
 * Layout em duas colunas: fila de candidaturas (filtro por status + paginação)
 * e painel de avaliação da candidatura selecionada, que carrega:
 * - `GET /applications/:id` (payload completo a partir de `UNDER_REVIEW`);
 * - `GET /candidates/:userId` (perfil do candidato, completo ou reduzido — a
 *   regra é do backend);
 * - `GET /applications/:id/interviews` (entrevistas).
 *
 * Fora do escopo (vaga de outra empresa) devolve `404` no backend: a tela
 * mostra "não encontrada", nunca "sem permissão".
 */
@Component({
  selector: 'app-job-applications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AlertComponent,
    EmptyStateComponent,
    LoadingComponent,
    PaginationComponent,
    ApplicationStatusBadgeComponent,
    JobStatusBadgeComponent,
    ApplicationReviewComponent,
    CandidateCardComponent,
  ],
  template: `
    <div class="container page">
      <a class="muted" routerLink="/recruiter/jobs">← Minhas vagas</a>

      @if (loading()) {
        <app-loading label="Carregando vaga…" />
      } @else if (loadError()) {
        <div class="mt-4"><app-alert [message]="loadError()" kind="error" /></div>
      } @else {
        @if (job(); as job) {
          <div class="page-header">
            <div class="page-header__titles">
              <h1>{{ job.title }}</h1>
              <p class="page-header__subtitle mb-0">
                {{ job.company.name }} · {{ job.isRemote ? 'Remota' : 'Presencial' }} · {{ salary(job) }} ·
                {{ job.filledCount }}/{{ job.vacancies }} posição(ões) preenchida(s) · criada em
                {{ date(job.createdAt) }}
              </p>
            </div>
            <div class="page-header__actions">
              <app-job-status [status]="job.status" />
              <a class="btn btn--sm" [routerLink]="['/jobs', job.id]" target="_blank">Ver na vitrine</a>
              <a class="btn btn--sm" [routerLink]="['/recruiter/jobs', job.id, 'edit']">Editar vaga</a>
              @if (canChangeStatus()) {
                <select
                  class="select select--sm"
                  #jobStatusSelect
                  (change)="onStatusChange($event, job, jobStatusSelect)"
                  aria-label="Mudar status da vaga"
                  [disabled]="changingJobStatus()"
                >
                  <option value="" disabled selected>Mudar status…</option>
                  @for (status of transitions(job.status); track status) {
                    <option [value]="status">{{ statusLabel(status) }}</option>
                  }
                </select>
              }
            </div>
          </div>

          @if (jobError()) {
            <div class="mb-4"><app-alert [message]="jobError()" kind="error" /></div>
          }
        }

        <div class="grid grid--sidebar">
          <!-- Fila de candidaturas ----------------------------------------- -->
          <section>
            <div class="row row--between mb-4">
              <label class="filters">
                <span class="field__label" for="appStatus">Status</span>
                <select id="appStatus" class="select" [value]="statusFilter()" (change)="changeStatusFilter($event)">
                  <option value="">Todos</option>
                  @for (status of statuses; track status) {
                    <option [value]="status">{{ applicationLabel(status) }}</option>
                  }
                </select>
              </label>
              @if (applicationsPage(); as page) {
                <span class="muted">{{ page.total }} candidatura(s)</span>
              }
            </div>

            @if (applicationsLoading()) {
              <app-loading label="Carregando candidaturas…" />
            } @else if (applicationsError()) {
              <app-alert [message]="applicationsError()" kind="error" />
            } @else if (applicationsPage()!.data.length) {
              <div class="list">
                @for (application of applicationsPage()!.data; track application.id) {
                  <button
                    type="button"
                    class="application-row"
                    [class.application-row--selected]="selectedId() === application.id"
                    (click)="select(application.id)"
                  >
                    <span class="application-row__avatar" aria-hidden="true">{{
                      initials(application.candidate.name)
                    }}</span>
                    <span class="application-row__body">
                      <span class="application-row__name">{{ application.candidate.name }}</span>
                      <span class="application-row__meta">
                        #{{ application.id }} · recebida {{ date(application.createdAt) }}
                        @if (application.resumeDocument) {
                          · currículo anexado
                        }
                      </span>
                    </span>
                    <app-application-status [status]="application.status" />
                  </button>
                }
              </div>

              <app-pagination
                [page]="applicationsPage()!.page"
                [limit]="applicationsPage()!.limit"
                [total]="applicationsPage()!.total"
                label="candidaturas"
                (pageChange)="changePage($event)"
              />
            } @else {
              <app-empty-state
                icon="📥"
                title="Nenhuma candidatura recebida"
                description="Assim que alguém se candidatar a esta vaga, o processo de triagem aparece aqui."
              />
            }
          </section>

          <!-- Painel de avaliação ------------------------------------------ -->
          <aside class="stack">
            @if (selectedId() === null) {
              <div class="card card--tight">
                <p class="muted mb-0">
                  Selecione uma candidatura à esquerda para avaliar, mover no processo, agendar entrevista e baixar o
                  currículo.
                </p>
              </div>
            } @else if (detailLoading()) {
              <app-loading label="Carregando candidatura…" />
            } @else if (detailError()) {
              <app-alert [message]="detailError()" kind="error" />
            } @else {
              @if (selected(); as application) {
                <div class="card card--tight">
                  <div class="card__header">
                    <div class="card__title">Candidato</div>
                    <a class="btn btn--sm btn--ghost" [routerLink]="['/recruiter/applications', application.id]">
                      Tela cheia
                    </a>
                  </div>

                  <app-candidate-card
                    [name]="application.candidate.name"
                    [headline]="candidateHeadline()"
                    [skills]="candidateSkills()"
                    [summary]="candidateSummary()"
                    [phone]="candidatePhone()"
                    [address]="candidateAddress()"
                    [resumeName]="application.resumeDocument?.filename ?? null"
                    [resumeBytes]="application.resumeDocument?.sizeBytes ?? null"
                    [reduced]="!isDetailFull()"
                  />

                  @if (profileNote()) {
                    <p class="field__hint mt-4 mb-0">{{ profileNote() }}</p>
                  }
                </div>

                @if (coverLetter(); as letter) {
                  <div class="card card--tight">
                    <div class="card__header">
                      <div class="card__title">Carta de apresentação</div>
                    </div>
                    <p class="preserve-lines mb-0">{{ letter }}</p>
                  </div>
                }

                <app-application-review
                  [application]="application"
                  [interviews]="interviews()"
                  [interviewsError]="interviewsError()"
                  (changed)="reloadSelected()"
                />
              }
            }
          </aside>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .filters {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
      }

      .filters .select {
        width: auto;
      }

      .select--sm {
        width: auto;
        padding: 5px 10px;
        font-size: 0.8125rem;
      }

      .application-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        width: 100%;
        text-align: left;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        cursor: pointer;
        font: inherit;
        transition:
          border-color 120ms ease,
          background 120ms ease;
      }

      .application-row:hover {
        border-color: var(--color-border-strong);
      }

      .application-row--selected {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
      }

      .application-row__avatar {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        flex: none;
        border-radius: 50%;
        background: var(--color-surface-alt);
        color: var(--color-text-muted);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .application-row__body {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }

      .application-row__name {
        font-weight: 600;
      }

      .application-row__meta {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class JobApplicationsPageComponent {
  private readonly jobsService = inject(JobsService);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly profileService = inject(CandidateProfileService);
  private readonly interviewsService = inject(InterviewsService);
  private readonly permissions = inject(PermissionsService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly statuses = APPLICATION_STATUS;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly job = signal<ScopedJob | null>(null);
  protected readonly changingJobStatus = signal(false);
  protected readonly jobError = signal<string | null>(null);

  protected readonly applicationsLoading = signal(false);
  protected readonly applicationsError = signal<string | null>(null);
  protected readonly applicationsPage = signal<Paginated<Application> | null>(null);
  protected readonly statusFilter = signal<ApplicationStatus | ''>('');

  protected readonly selectedId = signal<number | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);
  protected readonly selected = signal<Application | null>(null);
  protected readonly profile = signal<CandidateProfile | null>(null);
  protected readonly profileNote = signal<string | null>(null);
  protected readonly interviews = signal<Interview[]>([]);
  protected readonly interviewsError = signal<string | null>(null);

  private jobId = 0;

  protected readonly isDetailFull = computed(() => {
    const application = this.selected();
    return application ? isFullApplication(application) : false;
  });

  protected readonly coverLetter = computed(() => this.selected()?.coverLetter ?? null);

  protected readonly candidateHeadline = computed(() => {
    const profile = this.profile();
    if (profile && 'headline' in profile) return profile.headline;
    const application = this.selected();
    return application && !isFullApplication(application) ? application.candidate.headline : null;
  });

  protected readonly candidateSkills = computed(() => {
    const profile = this.profile();
    if (profile) return profile.skills;
    const application = this.selected();
    return application && !isFullApplication(application) ? application.candidate.skills : [];
  });

  protected readonly candidateSummary = computed(() => {
    const profile = this.profile();
    return profile && isFullProfile(profile) ? profile.summary : null;
  });

  protected readonly candidatePhone = computed(() => {
    const profile = this.profile();
    return profile && isFullProfile(profile) ? profile.phone : null;
  });

  protected readonly candidateAddress = computed(() => {
    const profile = this.profile();
    if (!profile || !isFullProfile(profile)) return null;
    const parts = [profile.street, profile.city, profile.state, profile.cep].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : null;
  });

  constructor() {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(),
        tap((params) => {
          this.jobId = Number(params.get('jobId'));
        }),
        switchMap(() => this.jobsService.getJob(this.jobId)),
      )
      .subscribe({
        next: (job) => {
          this.job.set(job);
          this.loading.set(false);
          this.loadError.set(null);
          // Descoberta/refresh da empresa do recrutador logado.
          this.auth.adoptCompanyId(job.companyId);
          this.loadApplications();
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.loadError.set(
            apiError.status === 404 || apiError.status === 403 ? 'Vaga não encontrada.' : apiError.message,
          );
        },
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const status = params.get('status');
      this.statusFilter.set(
        (APPLICATION_STATUS as readonly string[]).includes(status ?? '') ? (status as ApplicationStatus) : '',
      );
      const selected = params.get('application');
      const selectedId = selected ? Number(selected) : null;
      if (selectedId && selectedId !== this.selectedId()) {
        this.loadDetail(selectedId);
      } else if (!selectedId) {
        this.selectedId.set(null);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Vaga
  // -------------------------------------------------------------------------

  protected canChangeStatus(): boolean {
    return this.permissions.can(PERMISSIONS.JOB_STATUS_UPDATE);
  }

  protected transitions(status: JobStatus): JobStatus[] {
    return this.jobsService.allowedTransitions(status);
  }

  protected onStatusChange(event: Event, job: ScopedJob, select: HTMLSelectElement): void {
    const status = select.value as JobStatus;
    if (!status || status === job.status) {
      select.value = '';
      return;
    }

    this.changingJobStatus.set(true);
    this.jobError.set(null);

    this.jobsService
      .updateJobStatus(job.id, status)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.changingJobStatus.set(false);
          this.job.set(updated);
          select.value = '';
          this.toasts.success(`Vaga movida para "${this.statusLabel(updated.status)}".`);
        },
        error: (apiError: ApiError) => {
          this.changingJobStatus.set(false);
          this.jobError.set(apiError.message);
          select.value = '';
        },
      });
  }

  protected statusLabel(status: JobStatus): string {
    return JOB_STATUS_LABEL[status] ?? status;
  }

  // -------------------------------------------------------------------------
  // Lista de candidaturas
  // -------------------------------------------------------------------------

  private loadApplications(page = 1): void {
    this.applicationsLoading.set(true);
    this.applicationsError.set(null);

    this.applicationsService
      .listForJob(this.jobId, {
        page,
        limit: 10,
        status: this.statusFilter() || undefined,
      })
      .pipe(take(1), materialize())
      .subscribe((notification) => {
        // COMPLETE não é erro (ver comentário equivalente no profile).
        if (notification.kind === 'C') return;
        this.applicationsLoading.set(false);

        if (notification.kind !== 'N' || !notification.value) {
          const apiError = notification.error as ApiError | undefined;
          this.applicationsError.set(apiError?.message ?? 'Não foi possível carregar as candidaturas.');
          this.applicationsPage.set(null);
          return;
        }

        const page = notification.value as Paginated<Application>;
        this.applicationsPage.set(page);
        this.applicationsError.set(null);

        // Seleciona automaticamente a primeira quando nada está selecionado.
        if (!this.selectedId() && page.data.length > 0) {
          this.select(page.data[0].id);
        }
      });
  }

  /** Seleciona pela URL — a assinatura de `queryParamMap` carrega o detalhe. */
  protected select(id: number): void {
    if (this.selectedId() === id) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { application: id },
      queryParamsHandling: 'merge',
    });
  }

  protected reloadSelected(): void {
    this.loadApplications();
    const id = this.selectedId();
    if (id) this.loadDetail(id);
    if (this.job())
      this.jobsService
        .getJob(this.jobId)
        .pipe(take(1))
        .subscribe((job) => this.job.set(job));
  }

  /**
   * O filtro é refletido na URL (compartilhável) e aplicado imediatamente —
   * sem depender do tempo da navegação para recarregar a lista.
   */
  protected changeStatusFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: value || null, page: null, application: null },
      queryParamsHandling: 'merge',
    });
    this.statusFilter.set(
      (APPLICATION_STATUS as readonly string[]).includes(value) ? (value as ApplicationStatus) : '',
    );
    this.selectedId.set(null);
    this.selected.set(null);
    this.loadApplications(1);
  }

  protected changePage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge' });
    this.loadApplications(page);
  }

  // -------------------------------------------------------------------------
  // Detalhe da candidatura selecionada
  // -------------------------------------------------------------------------

  private loadDetail(id: number): void {
    this.selectedId.set(id);
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.profile.set(null);
    this.profileNote.set(null);
    this.interviews.set([]);
    this.interviewsError.set(null);

    this.applicationsService
      .get(id)
      .pipe(take(1))
      .subscribe({
        next: (application) => {
          this.selected.set(application);
          this.detailLoading.set(false);

          this.loadProfile(application.candidate.id, application.status);
          this.loadInterviews(id);
        },
        error: (apiError: ApiError) => {
          this.detailLoading.set(false);
          this.detailError.set(
            apiError.status === 404
              ? 'Candidatura não encontrada.'
              : apiError.status === 403
                ? 'Você não tem permissão para ver esta candidatura.'
                : apiError.message,
          );
        },
      });
  }

  private loadProfile(candidateId: number, status: ApplicationStatus): void {
    this.profileService
      .getByUserId(candidateId)
      .pipe(
        take(1),
        catchError(() => of<CandidateProfile | null>(null)),
      )
      .subscribe((profile) => {
        this.profile.set(profile);
        if (!profile) {
          this.profileNote.set(
            'O candidato ainda não criou o perfil público (o backend só devolve os dados enviados na candidatura).',
          );
          return;
        }
        if (!isFullProfile(profile)) {
          this.profileNote.set(
            status === 'PENDING'
              ? 'Enquanto a candidatura estiver em "Em análise", o backend libera apenas dados de triagem.'
              : 'Perfil resumido devolvido pelo backend para esta candidatura.',
          );
        }
      });
  }

  private loadInterviews(applicationId: number): void {
    this.interviewsService
      .listForApplication(applicationId)
      .pipe(
        take(1),
        catchError(() => of<Interview[] | null>(null)),
      )
      .subscribe((result) => {
        if (result === null) {
          this.interviewsError.set('Não foi possível carregar as entrevistas desta candidatura.');
          return;
        }
        this.interviews.set(result);
      });
  }

  // -------------------------------------------------------------------------
  // Apresentação
  // -------------------------------------------------------------------------

  protected applicationLabel(status: ApplicationStatus): string {
    return APPLICATION_STATUS_LABEL[status] ?? status;
  }

  protected salary(job: ScopedJob): string {
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  protected date(iso: string): string {
    return formatDateTime(iso);
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap, take, tap } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { JOB_STATUS_LABEL, formatDateTime, formatSalary } from '../../../core/format';
import type { JobStatus, Paginated, ScopedJob } from '../../../core/models';
import { JOB_STATUS } from '../../../core/models';
import { JobsService } from '../../../core/services/jobs.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { PaginationComponent } from '../../../shared/ui/pagination';
import { JobStatusBadgeComponent } from '../../../shared/ui/status-badges';

/**
 * "Minhas vagas" (`GET /jobs/mine`) — recrutador vê as vagas da própria empresa
 * em qualquer status; ADMIN vê as de todas as empresas.
 *
 * Ações por linha: candidaturas, editar e mudar status — os botões de status
 * são gerados a partir da mesma tabela de transições do backend, então a UI
 * nunca oferece uma transição que devolveria `400 invalid_status_transition`.
 */
@Component({
  selector: 'app-my-jobs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AlertComponent,
    EmptyStateComponent,
    LoadingComponent,
    PaginationComponent,
    JobStatusBadgeComponent,
  ],
  template: `
    <div class="container page">
      <div class="page-header">
        <div class="page-header__titles">
          <h1>Minhas vagas</h1>
          <p class="page-header__subtitle mb-0">
            Vagas da empresa em todos os status. Rascunhos só aparecem para candidatos depois de publicadas (status
            "Aberta").
          </p>
        </div>
        <div class="page-header__actions">
          <a class="btn btn--primary btn--sm" routerLink="/recruiter/jobs/new">Nova vaga</a>
        </div>
      </div>

      @if (noCompany()) {
        <app-empty-state
          icon="🏢"
          title="Sua conta ainda não está vinculada a uma empresa"
          description="Peça a um administrador para vincular você a uma empresa (Administração → Usuários). Sem vínculo, o backend não permite criar nem listar vagas."
        />
      } @else {
        <div class="row row--between mb-4">
          <label class="filters">
            <span class="field__label" for="jobStatus">Exibir</span>
            <select id="jobStatus" class="select" [value]="selectValue()" (change)="changeStatus($event)">
              <option value="ativas">Ativas (padrão)</option>
              <option value="todas">Todas, inclusive canceladas</option>
              <option disabled>— por status —</option>
              @for (status of statuses; track status) {
                <option [value]="status">{{ label(status) }}</option>
              }
            </select>
          </label>
          @if (result(); as page) {
            <span class="muted">{{ page.total }} vaga(s)</span>
          }
        </div>

        @if (error()) {
          <div class="mb-4"><app-alert [message]="error()" kind="error" /></div>
        }

        @if (loading()) {
          <app-loading label="Carregando vagas…" />
        } @else if (visibleRows().length > 0 || hiddenCanceled().length > 0) {
          @if (hiddenCanceled().length > 0) {
            <div class="alert alert--info mb-4">
              <span class="alert__icon" aria-hidden="true">i</span>
              <div class="alert__body">
                {{ hiddenCanceled().length }} vaga(s) cancelada(s) desta página estão ocultas na visão "Ativas" —
                cancelamento é o soft-delete do backend: o histórico é preservado, mas não faz parte do dia a dia.
              </div>
              <div class="alert__actions">
                <button type="button" class="btn btn--sm" (click)="showAll()">Ver todas</button>
              </div>
            </div>
          }

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Vaga</th>
                  <th>Status</th>
                  <th>Posições</th>
                  <th>Salário</th>
                  <th>Criada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (job of visibleRows(); track job.id) {
                  <tr>
                    <td>
                      <a class="cell-title" [routerLink]="['/recruiter/jobs', job.id]">{{ job.title }}</a>
                      <div class="cell-sub">{{ job.isRemote ? 'Remota' : 'Presencial' }} · {{ job.company.name }}</div>
                    </td>
                    <td><app-job-status [status]="job.status" /></td>
                    <td class="nowrap">{{ job.filledCount }}/{{ job.vacancies }}</td>
                    <td class="nowrap">{{ salary(job) }}</td>
                    <td class="nowrap">{{ date(job.createdAt) }}</td>
                    <td class="actions">
                      <div class="btn-group" style="justify-content: flex-end">
                        <a class="btn btn--sm" [routerLink]="['/recruiter/jobs', job.id]">Candidaturas</a>
                        <a class="btn btn--sm" [routerLink]="['/recruiter/jobs', job.id, 'edit']">Editar</a>
                        @if (transitions(job.status).length > 0) {
                          <button type="button" class="btn btn--sm" (click)="openStatus(job)">Status</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="result()!.page"
            [limit]="result()!.limit"
            [total]="result()!.total"
            label="vagas"
            (pageChange)="changePage($event)"
          />
        } @else if (!error()) {
          <app-empty-state
            icon="📌"
            title="Nenhuma vaga neste filtro"
            description="Crie uma vaga para começar a receber candidaturas."
          >
            <a class="btn btn--primary" routerLink="/recruiter/jobs/new">Criar vaga</a>
          </app-empty-state>
        }
      }

      @if (statusTarget(); as job) {
        <div class="modal-backdrop" (click)="closeStatus()">
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Alterar status da vaga"
            (click)="$event.stopPropagation()"
          >
            <div class="modal__header">
              <div>
                <div class="modal__title">Alterar status da vaga</div>
                <div class="card__hint">{{ job.title }}</div>
              </div>
              <button type="button" class="icon-button" (click)="closeStatus()" aria-label="Fechar">×</button>
            </div>

            <p class="muted">
              Status atual: <app-job-status [status]="job.status" /> · {{ job.filledCount }} de
              {{ job.vacancies }} posição(ões) preenchida(s).
            </p>

            @if (statusError()) {
              <div class="mb-4"><app-alert [message]="statusError()" kind="error" /></div>
            }

            <div class="stack">
              @for (status of transitions(job.status); track status) {
                <button
                  type="button"
                  class="btn btn--block status-option"
                  [class.btn--danger]="status === 'CANCELED' || status === 'CLOSED'"
                  [disabled]="changingStatus()"
                  (click)="applyStatus(job, status)"
                >
                  <span>
                    <span class="strong">{{ label(status) }}</span>
                    <span class="status-option__hint">{{ transitionHint(job, status) }}</span>
                  </span>
                </button>
              }
            </div>

            <div class="modal__footer">
              <button type="button" class="btn" (click)="closeStatus()">Fechar</button>
            </div>
          </div>
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

      .status-option {
        justify-content: flex-start;
        text-align: left;
      }

      .status-option__hint {
        display: block;
        font-weight: 400;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class MyJobsPageComponent {
  private readonly jobsService = inject(JobsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly statuses = JOB_STATUS;
  protected readonly result = signal<Paginated<ScopedJob> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly noCompany = signal(false);
  protected readonly statusFilter = signal<JobStatus | ''>('');
  /**
   * Visão padrão esconde canceladas (soft-delete): o dia a dia do recrutador
   * são as vagas vivas; o histórico continua a um clique ("Todas").
   */
  protected readonly viewMode = signal<'ativas' | 'todas'>('ativas');

  protected readonly visibleRows = computed(() => {
    const rows = this.result()?.data ?? [];
    if (this.statusFilter() || this.viewMode() === 'todas') return rows;
    return rows.filter((job) => job.status !== 'CANCELED');
  });

  protected readonly hiddenCanceled = computed(() => {
    const rows = this.result()?.data ?? [];
    if (this.statusFilter() || this.viewMode() === 'todas') return [];
    return rows.filter((job) => job.status === 'CANCELED');
  });

  protected readonly selectValue = computed(() => this.statusFilter() || this.viewMode());

  protected readonly statusTarget = signal<ScopedJob | null>(null);
  protected readonly changingStatus = signal(false);
  protected readonly statusError = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(),
        tap((params) => {
          const status = params.get('status');
          this.statusFilter.set((JOB_STATUS as readonly string[]).includes(status ?? '') ? (status as JobStatus) : '');
        }),
        switchMap(() =>
          this.jobsService.listMyJobs({
            page: Number(this.route.snapshot.queryParamMap.get('page') ?? 1) || 1,
            limit: 10,
            status: this.statusFilter() || undefined,
          }),
        ),
        catchError((apiError: ApiError) => {
          this.loading.set(false);
          if (apiError.status === 404) {
            // Recrutador sem empresa → 404 anti-enumeração do backend.
            this.noCompany.set(true);
            this.error.set(null);
          } else {
            this.error.set(apiError.message);
          }
          return of<Paginated<ScopedJob> | null>(null);
        }),
      )
      .subscribe((page) => {
        if (page) {
          this.result.set(page);
          this.error.set(null);
          this.noCompany.set(false);
        }
        this.loading.set(false);
      });
  }

  protected label(status: JobStatus): string {
    return JOB_STATUS_LABEL[status];
  }

  protected transitions(status: JobStatus): JobStatus[] {
    return this.jobsService.allowedTransitions(status);
  }

  protected transitionHint(job: ScopedJob, status: JobStatus): string {
    switch (status) {
      case 'OPEN':
        return job.status === 'DRAFT'
          ? 'Publica a vaga na vitrine e aceita candidaturas.'
          : 'Reabre para novas candidaturas.';
      case 'PAUSED':
        return 'Fecha temporariamente para novas candidaturas (pode reabrir).';
      case 'FILLED':
        return job.filledCount >= job.vacancies
          ? 'Todas as posições foram contratadas.'
          : `Só é aceito quando todas as ${job.vacancies} posições estiverem contratadas (atual: ${job.filledCount}).`;
      case 'CLOSED':
        return 'Encerra definitivamente a vaga.';
      case 'CANCELED':
        return 'Cancela a vaga (é o soft-delete: candidaturas e histórico são preservados).';
      default:
        return '';
    }
  }

  protected salary(job: ScopedJob): string {
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  protected date(iso: string): string {
    return formatDateTime(iso);
  }

  protected openStatus(job: ScopedJob): void {
    this.statusTarget.set(job);
    this.statusError.set(null);
  }

  protected closeStatus(): void {
    this.statusTarget.set(null);
    this.statusError.set(null);
  }

  protected applyStatus(job: ScopedJob, status: JobStatus): void {
    if (this.changingStatus()) return;
    this.changingStatus.set(true);
    this.statusError.set(null);

    this.jobsService
      .updateJobStatus(job.id, status)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.changingStatus.set(false);
          this.closeStatus();
          this.toasts.success(`Vaga movida para "${this.label(updated.status)}".`);
          this.refreshRow(updated);
        },
        error: (apiError: ApiError) => {
          this.changingStatus.set(false);
          this.statusError.set(apiError.message);
        },
      });
  }

  /** Atualiza a linha sem recarregar a página inteira. */
  private refreshRow(updated: ScopedJob): void {
    const page = this.result();
    if (!page) return;
    this.result.set({
      ...page,
      data: page.data.map((job) => (job.id === updated.id ? updated : job)),
    });
  }

  protected showAll(): void {
    this.viewMode.set('todas');
    this.statusFilter.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected changeStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'ativas' || value === 'todas') {
      this.viewMode.set(value);
      this.statusFilter.set('');
    } else {
      this.statusFilter.set((JOB_STATUS as readonly string[]).includes(value) ? (value as JobStatus) : '');
      this.viewMode.set('ativas');
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: this.statusFilter() || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected changePage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge' });
  }
}

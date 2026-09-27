import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, take } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { APPLICATION_STATUS_LABEL, formatDate, formatDays, formatPercent } from '../../../core/format';
import type { Application, CompanyStats, Paginated, ScopedJob } from '../../../core/models';
import { isFullApplication } from '../../../core/models';
import { ApplicationsService } from '../../../core/services/applications.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { JobsService } from '../../../core/services/jobs.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { ApplicationStatusBadgeComponent, JobStatusBadgeComponent } from '../../../shared/ui/status-badges';

/**
 * Painel do recrutador.
 *
 * Combina três chamadas reais do backend:
 * - `GET /jobs/mine` — vagas da própria empresa (e é ela que revela o
 *   `companyId`, já que o login devolve só `{id, name, email, role}`);
 * - `GET /companies/:id/stats` — indicadores (funil, conversão, tempo médio);
 * - `GET /jobs/:jobId/applications?status=PENDING` — fila de triagem.
 *
 * Recrutador sem empresa vinculada recebe `404` do backend em `/jobs/mine`:
 * a tela mostra o estado vazio explicando o vínculo pendente (nunca dado falso).
 */
@Component({
  selector: 'app-recruiter-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AlertComponent,
    EmptyStateComponent,
    LoadingComponent,
    ApplicationStatusBadgeComponent,
    JobStatusBadgeComponent,
  ],
  template: `
    <div class="container page">
      <div class="page-header">
        <div class="page-header__titles">
          <h1>Painel do recrutador</h1>
          <p class="page-header__subtitle mb-0">
            {{ companyName() || 'Visão consolidada da sua empresa' }}
          </p>
        </div>
        <div class="page-header__actions">
          <a class="btn btn--sm" routerLink="/recruiter/stats">Indicadores completos</a>
          <a class="btn btn--sm" routerLink="/recruiter/jobs">Minhas vagas</a>
          <a class="btn btn--primary btn--sm" routerLink="/recruiter/jobs/new">Nova vaga</a>
        </div>
      </div>

      @if (loading()) {
        <app-loading label="Carregando painel…" />
      } @else {
        @if (error()) {
          <div class="mb-4"><app-alert [message]="error()" kind="error" /></div>
        }

        @if (noCompany()) {
          <app-empty-state
            icon="🏢"
            title="Nenhuma empresa vinculada à sua conta"
            description="Um administrador precisa vincular você a uma empresa em Administração → Usuários → alterar empresa. Assim que isso acontecer, suas vagas e candidaturas aparecem aqui."
          >
            <a class="btn" routerLink="/jobs">Ver a vitrine pública</a>
          </app-empty-state>
        } @else {
          <div class="grid grid--4 mb-4">
            <div class="metric">
              <span class="metric__label">Vagas publicadas</span>
              <span class="metric__value">{{ totalJobs() }}</span>
              <span class="metric__hint">{{ openJobsCount() }} aberta(s) agora</span>
            </div>
            <div class="metric">
              <span class="metric__label">Candidaturas recebidas</span>
              <span class="metric__value">{{ totalApplications() }}</span>
              <span class="metric__hint">{{ pendingCount() }} aguardando triagem</span>
            </div>
            <div class="metric">
              <span class="metric__label">Taxa de conversão</span>
              <span class="metric__value">{{ conversion() }}</span>
              <span class="metric__hint">contratados / candidaturas</span>
            </div>
            <div class="metric">
              <span class="metric__label">Tempo médio até contratar</span>
              <span class="metric__value">{{ timeToHire() }}</span>
              <span class="metric__hint">calculado sobre o histórico real</span>
            </div>
          </div>

          <div class="grid grid--sidebar">
            <section class="card">
              <div class="card__header">
                <div>
                  <div class="card__title">Candidaturas aguardando triagem</div>
                  <div class="card__hint">Status "Em análise" nas vagas mais recentes da empresa.</div>
                </div>
                <a class="btn btn--sm" routerLink="/recruiter/jobs">Ver por vaga</a>
              </div>

              @if (pendingApplications().length > 0) {
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Candidato</th>
                        <th>Vaga</th>
                        <th>Status</th>
                        <th>Recebida</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (application of pendingApplications(); track application.id) {
                        <tr>
                          <td class="cell-title">{{ application.candidate.name }}</td>
                          <td>{{ jobTitle(application) }}</td>
                          <td><app-application-status [status]="application.status" /></td>
                          <td class="nowrap">{{ date(application.createdAt) }}</td>
                          <td class="actions">
                            <a
                              class="btn btn--sm btn--primary"
                              [routerLink]="['/recruiter/applications', application.id]"
                            >
                              Avaliar
                            </a>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="muted mb-0">Nenhuma candidatura nova aguardando triagem.</p>
              }
            </section>

            <aside class="stack">
              <section class="card card--tight">
                <div class="card__header">
                  <div class="card__title">Funil de candidaturas</div>
                </div>
                @if (funnelRows().length > 0) {
                  <div class="funnel">
                    @for (row of funnelRows(); track row.status) {
                      <div class="funnel__row">
                        <span class="funnel__label">{{ row.label }}</span>
                        <span class="funnel__bar">
                          <span class="funnel__fill" [style.width.%]="row.percent"></span>
                        </span>
                        <span class="funnel__count">{{ row.count }}</span>
                      </div>
                    }
                  </div>
                } @else {
                  <p class="muted mb-0">Sem candidaturas registradas até agora.</p>
                }
              </section>

              <section class="card card--tight">
                <div class="card__header">
                  <div class="card__title">Vagas recentes</div>
                  <a class="btn btn--sm btn--ghost" routerLink="/recruiter/jobs">Todas</a>
                </div>
                @if (recentJobs().length > 0) {
                  <div class="list">
                    @for (job of recentJobs(); track job.id) {
                      <div class="row row--between mini-job">
                        <div class="mini-job__info">
                          <a class="cell-title truncate" [routerLink]="['/recruiter/jobs', job.id]">{{ job.title }}</a>
                          <div class="cell-sub">
                            {{ job.filledCount }}/{{ job.vacancies }} preenchida(s) · {{ date(job.createdAt) }}
                          </div>
                        </div>
                        <app-job-status [status]="job.status" />
                      </div>
                    }
                  </div>
                } @else {
                  <p class="muted mb-0">
                    Nenhuma vaga criada ainda.
                    <a routerLink="/recruiter/jobs/new">Criar a primeira vaga</a>
                  </p>
                }
              </section>
            </aside>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .mini-job {
        padding-block: var(--space-2);
        border-bottom: 1px solid var(--color-border);
        gap: var(--space-3);
      }

      .mini-job:last-child {
        border-bottom: 0;
      }

      .mini-job__info {
        min-width: 0;
      }
    `,
  ],
})
export class RecruiterDashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly jobsService = inject(JobsService);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly companiesService = inject(CompaniesService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly noCompany = signal(false);

  protected readonly stats = signal<CompanyStats | null>(null);
  protected readonly jobs = signal<ScopedJob[]>([]);
  protected readonly pendingApplications = signal<Application[]>([]);

  protected readonly companyName = computed(() => this.auth.ownCompany()?.name ?? '');
  protected readonly totalJobs = computed(() => this.stats()?.jobs.total ?? 0);
  protected readonly totalApplications = computed(() => this.stats()?.applications.total ?? 0);
  protected readonly openJobsCount = computed(() => this.stats()?.jobs.byStatus.OPEN ?? 0);
  protected readonly pendingCount = computed(() => this.stats()?.applications.byStatus.PENDING ?? 0);
  protected readonly conversion = computed(() => formatPercent(this.stats()?.applications.conversionRate));
  protected readonly timeToHire = computed(() => formatDays(this.stats()?.applications.avgTimeToHireDays));
  protected readonly recentJobs = computed(() => this.jobs().slice(0, 5));

  protected readonly funnelRows = computed(() => {
    const byStatus = this.stats()?.applications.byStatus;
    if (!byStatus) return [];
    const entries = Object.entries(byStatus) as [string, number][];
    const max = Math.max(1, ...entries.map(([, count]) => count));
    return entries.map(([status, count]) => ({
      status,
      label: APPLICATION_STATUS_LABEL[status as keyof typeof APPLICATION_STATUS_LABEL] ?? status,
      count,
      percent: Math.round((count / max) * 100),
    }));
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.jobsService
      .listMyJobs({ page: 1, limit: 20 })
      .pipe(
        take(1),
        catchError((apiError: { status?: number }) => {
          // 404 em /jobs/mine = recrutador sem empresa (anti-enumeração).
          this.noCompany.set(apiError?.status === 404);
          if (apiError?.status !== 404) {
            this.error.set('Não foi possível carregar as vagas da sua empresa.');
          }
          return of<Paginated<ScopedJob> | null>(null);
        }),
      )
      .subscribe((page) => {
        if (!page) {
          this.loading.set(false);
          return;
        }

        this.jobs.set(page.data);
        const companyId = page.data[0]?.companyId ?? this.auth.ownCompanyId();
        if (!companyId) {
          this.noCompany.set(true);
          this.loading.set(false);
          return;
        }

        forkJoin({
          company: this.auth.ownCompanyOnce(),
          stats: this.companiesService.getStats(companyId).pipe(catchError(() => of<CompanyStats | null>(null))),
          pending: this.pendingForJobs(page.data),
        })
          .pipe(take(1))
          .subscribe(({ stats, pending }) => {
            this.stats.set(stats);
            this.pendingApplications.set(pending);
            this.loading.set(false);
          });
      });
  }

  /** Candidaturas `PENDING` das vagas mais recentes (melhor esforço por vaga). */
  private pendingForJobs(jobs: ScopedJob[]) {
    const targets = jobs.slice(0, 5);
    if (targets.length === 0) return of<Application[]>([]);

    return forkJoin(
      targets.map((job) =>
        this.applicationsService
          .listForJob(job.id, { status: 'PENDING', page: 1, limit: 10 })
          .pipe(catchError(() => of<Paginated<Application> | null>(null))),
      ),
    ).pipe(map((pages) => pages.flatMap((page) => page?.data ?? []).slice(0, 12)));
  }

  protected jobTitle(application: Application): string {
    if (isFullApplication(application)) return application.job.title;
    return this.jobs().find((job) => job.id === application.jobId)?.title ?? `Vaga #${application.jobId}`;
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }
}

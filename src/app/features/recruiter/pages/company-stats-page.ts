import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of, switchMap, take, tap } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionsService } from '../../../core/auth/permissions.service';
import { APPLICATION_STATUS_LABEL, JOB_STATUS_LABEL, formatDays, formatPercent } from '../../../core/format';
import type { ApplicationStatus, Company, CompanyStats, JobStatus } from '../../../core/models';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';

/**
 * Indicadores de negócio (`GET /companies/:id/stats`).
 *
 * - RECRUITER: só a própria empresa (o backend responde `404` para empresa de
 *   terceiro — anti-enumeração), então não há seletor;
 * - ADMIN: pode escolher qualquer empresa entre as descobertas no sistema.
 *
 * O que vem do backend: vagas por status, funil de candidaturas por status,
 * taxa de conversão (`HIRED`/total) e tempo médio até contratação (calculado
 * sobre `ApplicationStatusHistory` real). Nenhum número aqui é estimado no
 * cliente — o que não existe ainda aparece como "—".
 */
@Component({
  selector: 'app-company-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AlertComponent, EmptyStateComponent, LoadingComponent],
  template: `
    <div class="container page">
      <div class="page-header">
        <div class="page-header__titles">
          <h1>Indicadores da empresa</h1>
          <p class="page-header__subtitle mb-0">
            @if (companyName()) {
              {{ companyName() }}
            } @else {
              Funil de candidaturas, conversão e tempo médio até a contratação.
            }
          </p>
        </div>
        <div class="page-header__actions">
          @if (permissions.isAdmin()) {
            <label class="filters">
              <span class="field__label" for="companySelect">Empresa</span>
              <select id="companySelect" class="select" [value]="companyId() ?? ''" (change)="changeCompany($event)">
                <option value="" disabled>Selecione…</option>
                @for (company of companies(); track company.id) {
                  <option [value]="company.id">{{ company.name }}</option>
                }
              </select>
            </label>
          }
          <button type="button" class="btn btn--sm" (click)="reload()" [disabled]="loading()">Atualizar</button>
        </div>
      </div>

      @if (error()) {
        <div class="mb-4"><app-alert [message]="error()" kind="error" /></div>
      }

      @if (loading()) {
        <app-loading label="Carregando indicadores…" />
      } @else if (!companyId()) {
        <app-empty-state
          icon="building"
          title="Nenhuma empresa para exibir"
          description="Não há empresa vinculada à sua conta (ou nenhuma empresa cadastrada no sistema)."
        />
      } @else if (stats(); as stats) {
        <div class="grid grid--4 mb-4">
          <div class="metric">
            <span class="metric__label">Vagas</span>
            <span class="metric__value">{{ stats.jobs.total }}</span>
            <span class="metric__hint">{{ stats.jobs.byStatus['OPEN'] }} aberta(s)</span>
          </div>
          <div class="metric">
            <span class="metric__label">Candidaturas</span>
            <span class="metric__value">{{ stats.applications.total }}</span>
            <span class="metric__hint">{{ stats.applications.byStatus['PENDING'] }} em triagem</span>
          </div>
          <div class="metric">
            <span class="metric__label">Taxa de conversão</span>
            <span class="metric__value">{{ percent(stats.applications.conversionRate) }}</span>
            <span class="metric__hint">contratados ÷ candidaturas</span>
          </div>
          <div class="metric">
            <span class="metric__label">Tempo médio até contratar</span>
            <span class="metric__value">{{ days(stats.applications.avgTimeToHireDays) }}</span>
            <span class="metric__hint">do envio da candidatura à contratação</span>
          </div>
        </div>

        <div class="grid grid--2">
          <section class="card">
            <div class="card__header">
              <div>
                <div class="card__title">Funil de candidaturas</div>
                <div class="card__hint">Contagem real por status nesta empresa.</div>
              </div>
            </div>
            <div class="funnel">
              @for (row of applicationRows(stats); track row.key) {
                <div class="funnel__row">
                  <span class="funnel__label">{{ row.label }}</span>
                  <span class="funnel__bar">
                    <span class="funnel__fill" [style.width.%]="row.percent"></span>
                  </span>
                  <span class="funnel__count">{{ row.count }}</span>
                </div>
              }
            </div>
          </section>

          <section class="card">
            <div class="card__header">
              <div>
                <div class="card__title">Vagas por status</div>
                <div class="card__hint">Inclui rascunhos e vagas encerradas/canceladas.</div>
              </div>
            </div>
            <div class="funnel">
              @for (row of jobRows(stats); track row.key) {
                <div class="funnel__row">
                  <span class="funnel__label">{{ row.label }}</span>
                  <span class="funnel__bar">
                    <span class="funnel__fill funnel__fill--alt" [style.width.%]="row.percent"></span>
                  </span>
                  <span class="funnel__count">{{ row.count }}</span>
                </div>
              }
            </div>
          </section>
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
        min-width: 200px;
      }

      .funnel__fill--alt {
        background: linear-gradient(90deg, #0f766e, #34a79b);
      }
    `,
  ],
})
export class CompanyStatsPageComponent {
  private readonly companiesService = inject(CompaniesService);
  private readonly directory = inject(CompanyDirectoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly permissions = inject(PermissionsService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<CompanyStats | null>(null);
  protected readonly companies = signal<Company[]>([]);
  protected readonly companyId = signal<number | null>(null);

  protected readonly companyName = computed(() => {
    const id = this.companyId();
    if (!id) return '';
    return (
      this.companies().find((company) => company.id === id)?.name ??
      this.directory.name(id) ??
      this.auth.ownCompany()?.name ??
      ''
    );
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        tap((params) => {
          const requested = Number(params.get('companyId'));
          if (this.permissions.isAdmin() && Number.isFinite(requested) && requested > 0) {
            this.companyId.set(requested);
          }
        }),
        switchMap(() => this.resolveCompanyId()),
        tap((id) => this.companyId.set(id)),
        switchMap((id) => (id ? this.companiesService.getStats(id) : of<CompanyStats | null>(null))),
        take(1),
      )
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.loading.set(false);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(
            apiError.status === 404 ? 'Empresa não encontrada (ou fora do seu escopo).' : apiError.message,
          );
        },
      });

    if (this.permissions.isAdmin()) {
      this.directory
        .discoverAllCompanies()
        .pipe(
          take(1),
          catchError(() => of<Company[]>([])),
        )
        .subscribe((companies) => this.companies.set(companies));
    } else {
      this.auth
        .ownCompanyOnce()
        .pipe(take(1))
        .subscribe((company) => {
          if (company) this.companies.set([company]);
        });
    }
  }

  /** ADMIN sem empresa na URL escolhe a primeira descoberta; RECRUITER usa a própria. */
  private resolveCompanyId() {
    if (this.companyId()) return of(this.companyId());

    if (this.permissions.isAdmin()) {
      return this.directory.discoverAllCompanies().pipe(
        take(1),
        catchError(() => of<Company[]>([])),
        switchMap((companies) => {
          this.companies.set(companies);
          return of(companies[0]?.id ?? null);
        }),
      );
    }

    return this.auth.ownCompanyOnce().pipe(
      switchMap((company) => {
        if (company) return of(company.id);
        // Sem empresa carregada: tenta descobrir pelas vagas do recrutador.
        return of(this.auth.ownCompanyId());
      }),
    );
  }

  protected changeCompany(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(value) || value <= 0) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { companyId: value },
      queryParamsHandling: 'merge',
    });
    this.companyId.set(value);
    this.loading.set(true);
    this.error.set(null);
    this.companiesService
      .getStats(value)
      .pipe(take(1))
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.loading.set(false);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.stats.set(null);
          this.error.set(apiError.status === 404 ? 'Empresa não encontrada.' : apiError.message);
        },
      });
  }

  protected reload(): void {
    const id = this.companyId();
    if (!id) return;
    this.loading.set(true);
    this.error.set(null);
    this.companiesService
      .getStats(id)
      .pipe(take(1))
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.loading.set(false);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(apiError.message);
        },
      });
  }

  protected percent(value: number | null): string {
    return formatPercent(value);
  }

  protected days(value: number | null): string {
    return formatDays(value);
  }

  protected applicationRows(stats: CompanyStats) {
    const entries = Object.entries(stats.applications.byStatus) as [ApplicationStatus, number][];
    const max = Math.max(1, ...entries.map(([, count]) => count));
    return entries.map(([key, count]) => ({
      key,
      label: APPLICATION_STATUS_LABEL[key] ?? key,
      count,
      percent: Math.round((count / max) * 100),
    }));
  }

  protected jobRows(stats: CompanyStats) {
    const entries = Object.entries(stats.jobs.byStatus) as [JobStatus, number][];
    const max = Math.max(1, ...entries.map(([, count]) => count));
    return entries.map(([key, count]) => ({
      key,
      label: JOB_STATUS_LABEL[key] ?? key,
      count,
      percent: Math.round((count / max) * 100),
    }));
  }
}

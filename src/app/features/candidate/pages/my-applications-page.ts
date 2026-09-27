import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiError } from '../../../core/api-error';
import { APPLICATION_STATUS_LABEL, formatDate } from '../../../core/format';
import type { Application, ApplicationStatus, Paginated } from '../../../core/models';
import { APPLICATION_STATUS, isFullApplication } from '../../../core/models';
import { ApplicationsService } from '../../../core/services/applications.service';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { PaginationComponent } from '../../../shared/ui/pagination';
import { ApplicationStatusBadgeComponent } from '../../../shared/ui/status-badges';

/**
 * "Minhas candidaturas" (`GET /applications/me`) — visão do candidato.
 *
 * A resposta traz `job` embutido, mas só com `companyId`: o nome da empresa é
 * resolvido pelo `CompanyDirectoryService` (o backend não expõe listagem
 * pública de empresas).
 */
@Component({
  selector: 'app-my-applications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AlertComponent,
    EmptyStateComponent,
    LoadingComponent,
    PaginationComponent,
    ApplicationStatusBadgeComponent,
  ],
  template: `
    <div class="container page">
      <div class="page-header">
        <div class="page-header__titles">
          <h1>Minhas candidaturas</h1>
          <p class="page-header__subtitle mb-0">
            Acompanhe o estágio de cada processo seletivo e as entrevistas agendadas.
          </p>
        </div>
        <div class="page-header__actions">
          <a class="btn btn--primary btn--sm" routerLink="/jobs">Buscar novas vagas</a>
        </div>
      </div>

      <div class="filters">
        <label class="field__label" for="statusFilter">Filtrar por status</label>
        <select id="statusFilter" class="select" [value]="statusFilter()" (change)="changeStatus($event)">
          <option value="">Todos</option>
          @for (status of statuses; track status) {
            <option [value]="status">{{ label(status) }}</option>
          }
        </select>
      </div>

      @if (error()) {
        <app-alert [message]="error()" kind="error" />
      }

      @if (loading()) {
        <app-loading label="Carregando candidaturas…" />
      } @else if (result()!.data.length) {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Vaga</th>
                <th>Empresa</th>
                <th>Status</th>
                <th>Enviada em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (application of result()!.data; track application.id) {
                <tr>
                  <td>
                    <a class="cell-title" [routerLink]="['/candidate/applications', application.id]">
                      {{ applicationTitle(application) }}
                    </a>
                    @if (!isFull(application)) {
                      <div class="cell-sub">detalhes limitados neste estágio</div>
                    }
                  </td>
                  <td>{{ companyName(application) }}</td>
                  <td><app-application-status [status]="application.status" /></td>
                  <td class="nowrap">{{ date(application.createdAt) }}</td>
                  <td class="actions">
                    <a class="btn btn--sm" [routerLink]="['/candidate/applications', application.id]">Abrir</a>
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
          label="candidaturas"
          (pageChange)="changePage($event)"
        />
      } @else if (!error()) {
        <app-empty-state
          icon="📄"
          title="Você ainda não se candidatou a nenhuma vaga"
          description="As vagas abertas estão na vitrine. A candidatura leva menos de um minuto."
        >
          <a class="btn btn--primary" routerLink="/jobs">Ver vagas abertas</a>
        </app-empty-state>
      }
    </div>
  `,
  styles: [
    `
      .filters {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
        max-width: 320px;
      }

      .filters .select {
        width: auto;
      }
    `,
  ],
})
export class MyApplicationsPageComponent {
  private readonly applications = inject(ApplicationsService);
  private readonly companies = inject(CompanyDirectoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statuses = APPLICATION_STATUS;
  protected readonly result = signal<Paginated<Application> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly statusFilter = signal<ApplicationStatus | ''>('');

  constructor() {
    this.route.queryParamMap
      .pipe(
        tap((params) => {
          const status = params.get('status');
          this.statusFilter.set(
            (APPLICATION_STATUS as readonly string[]).includes(status ?? '') ? (status as ApplicationStatus) : '',
          );
        }),
        switchMap(() =>
          this.applications.listMine({
            page: Number(this.route.snapshot.queryParamMap.get('page') ?? 1) || 1,
            limit: 10,
            status: this.statusFilter() || undefined,
          }),
        ),
        tap((page) => {
          // Resolve os nomes de empresa (uma chamada por id desconhecido).
          const ids = page.data.map((application) =>
            isFullApplication(application) ? application.job.companyId : null,
          );
          this.companies.load(ids).subscribe();
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(apiError.message);
        },
      });
  }

  protected label(status: ApplicationStatus): string {
    return APPLICATION_STATUS_LABEL[status];
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }

  protected isFull(application: Application): boolean {
    return isFullApplication(application);
  }

  protected applicationTitle(application: Application): string {
    return isFullApplication(application) ? application.job.title : `Vaga #${application.jobId}`;
  }

  protected companyName(application: Application): string {
    if (!isFullApplication(application)) return '—';
    return this.companies.name(application.job.companyId) || `Empresa #${application.job.companyId}`;
  }

  protected changeStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: value || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected changePage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge' });
  }
}

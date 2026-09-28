import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of, take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { formatDate, maskCnpj } from '../../../core/format';
import type { Company } from '../../../core/models';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { PaginationComponent } from '../../../shared/ui/pagination';

/**
 * Gestão de empresas (ADMIN).
 *
 * Como o backend não expõe `GET /companies` (só `GET /companies/:id`), a lista
 * é montada por descoberta de ids (`CompanyDirectoryService.discoverCompanies`,
 * a partir de `GET /jobs/mine` + `GET /users`) e cada empresa é então lida por
 * id. A limitação está documentada na própria tela.
 */
@Component({
  selector: 'app-companies-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AlertComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    LoadingComponent,
    PaginationComponent,
  ],
  template: `
    <div class="page-header">
      <div class="page-header__titles">
        <h1>Empresas</h1>
        <p class="page-header__subtitle mb-0">
          Cadastro de empresas com endereço resolvido por CEP (integração ViaCEP feita pelo backend).
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--sm" (click)="load()" [disabled]="loading()">Atualizar</button>
        <a class="btn btn--primary btn--sm" routerLink="/admin/companies/new">Nova empresa</a>
      </div>
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert [message]="error()" kind="error" /></div>
    }

    @if (loading()) {
      <app-loading label="Carregando empresas…" />
    } @else if (companies().length > 0) {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Empresa</th>
              <th>CNPJ</th>
              <th>Endereço (via CEP)</th>
              <th>Situação</th>
              <th>Criada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (company of visibleCompanies(); track company.id) {
              <tr>
                <td class="cell-sub">{{ company.id }}</td>
                <td>
                  <div class="cell-title">{{ company.name }}</div>
                  @if (company.description) {
                    <div class="cell-sub truncate">{{ company.description }}</div>
                  }
                </td>
                <td class="nowrap">{{ cnpj(company.cnpj) }}</td>
                <td>{{ address(company) }}</td>
                <td>
                  @if (company.isActive) {
                    <span class="badge badge--success">Ativa</span>
                  } @else {
                    <span class="badge badge--muted">Desativada</span>
                  }
                </td>
                <td class="nowrap">{{ date(company.createdAt) }}</td>
                <td class="actions">
                  <div class="btn-group" style="justify-content: flex-end">
                    <a class="btn btn--sm" [routerLink]="['/admin/companies', company.id, 'edit']">Editar</a>
                    <a
                      class="btn btn--sm"
                      [routerLink]="['/recruiter/stats']"
                      [queryParams]="{ companyId: company.id }"
                    >
                      Indicadores
                    </a>
                    <button
                      type="button"
                      class="btn btn--sm"
                      (click)="askToggle(company)"
                      [disabled]="busyId() === company.id"
                    >
                      {{ company.isActive ? 'Desativar' : 'Reativar' }}
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <app-pagination
        [page]="page()"
        [limit]="pageSize"
        [total]="companies().length"
        label="empresas"
        (pageChange)="page.set($event)"
      />
    } @else if (!error()) {
      <app-empty-state
        icon="building"
        title="Nenhuma empresa encontrada"
        description="Cadastre a primeira empresa para poder vincular recrutadores e publicar vagas."
      >
        <a class="btn btn--primary" routerLink="/admin/companies/new">Nova empresa</a>
      </app-empty-state>
    }

    @if (confirmTarget(); as company) {
      <app-confirm-dialog
        [title]="company.isActive ? 'Desativar empresa' : 'Reativar empresa'"
        [message]="toggleMessage(company)"
        [warning]="
          company.isActive
            ? 'Uma empresa desativada some da vitrine e para de receber candidaturas. Nada é apagado: dá para reativar depois.'
            : null
        "
        [confirmLabel]="company.isActive ? 'Desativar' : 'Reativar'"
        [tone]="company.isActive ? 'danger' : 'primary'"
        [busy]="busyId() === company.id"
        (confirmed)="toggle(company)"
        (cancelled)="confirmTarget.set(null)"
      />
    }
  `,
})
export class CompaniesPageComponent {
  private readonly companiesService = inject(CompaniesService);
  private readonly directory = inject(CompanyDirectoryService);
  private readonly toasts = inject(ToastService);

  protected readonly companies = signal<Company[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmTarget = signal<Company | null>(null);
  protected readonly busyId = signal<number | null>(null);

  /**
   * Paginação no CLIENTE: o backend não tem rota de lista de empresas (a
   * tabela nasce da varredura de ids), então não há paginação de servidor
   * para consumir — fatiar aqui é o comportamento honesto possível.
   */
  protected readonly pageSize = 10;
  protected readonly page = signal(1);
  protected readonly visibleCompanies = computed(() => {
    const all = this.companies();
    const start = (this.page() - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.directory
      .discoverAllCompanies()
      .pipe(take(1))
      .subscribe({
        next: (companies) => {
          this.companies.set(companies);
          this.loading.set(false);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(apiError.message);
        },
      });
  }

  protected toggleMessage(company: Company): string {
    return company.isActive ? `Desativar a empresa "${company.name}"?` : `Reativar a empresa "${company.name}"?`;
  }

  protected askToggle(company: Company): void {
    this.confirmTarget.set(company);
  }

  protected toggle(company: Company): void {
    this.busyId.set(company.id);
    const request = company.isActive
      ? this.companiesService.deactivate(company.id)
      : this.companiesService.reactivate(company.id);

    request
      .pipe(
        take(1),
        catchError((apiError: ApiError) => {
          this.busyId.set(null);
          this.confirmTarget.set(null);
          this.toasts.error(apiError.message);
          this.load();
          return of(null);
        }),
      )
      .subscribe((updated) => {
        if (!updated) return;
        this.busyId.set(null);
        this.confirmTarget.set(null);
        this.companies.update((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        this.directory.invalidate(updated.id);
        this.toasts.success(updated.isActive ? 'Empresa reativada.' : 'Empresa desativada.');
      });
  }

  protected address(company: Company): string {
    const parts = [company.street, company.city, company.state].filter(Boolean);
    if (parts.length === 0) {
      return company.cep ? `${company.cep} (endereço não confirmado)` : 'Sem endereço';
    }
    return `${parts.join(' — ')}${company.cep ? ` · CEP ${company.cep}` : ''}`;
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }

  protected cnpj(value: string | null): string {
    return value ? maskCnpj(value) : '—';
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of, switchMap, take, tap } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { formatDate, roleLabel as roleLabelText } from '../../../core/format';
import type { Company, Paginated, Role, UserSummary } from '../../../core/models';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { RolesService, UsersService } from '../../../core/services/users.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { ModalComponent } from '../../../shared/ui/modal';
import { PaginationComponent } from '../../../shared/ui/pagination';

/**
 * Gestão de usuários (ADMIN) — `GET /users` com filtros `role`/`companyId`/
 * `isActive` + paginação, e as quatro ações de gestão:
 * - `PATCH /users/:id/deactivate` (revoga os refresh tokens do alvo)
 * - `PATCH /users/:id/reactivate`
 * - `PATCH /users/:id/role` (`409 recrutador_com_vagas_ativas`, `409 last_active_admin`)
 * - `PATCH /users/:id/company` (só RECRUITER; `409 usuario_nao_e_recrutador`)
 *
 * A ação sobre a própria conta é desabilitada na UI (o backend responde `409`).
 */
@Component({
  selector: 'app-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    AlertComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    LoadingComponent,
    ModalComponent,
    PaginationComponent,
  ],
  template: `
    <div class="page-header">
      <div class="page-header__titles">
        <h1>Usuários</h1>
        <p class="page-header__subtitle mb-0">
          Contas da plataforma, seus papéis e vínculos com empresas. Desativar um usuário revoga as sessões dele.
        </p>
      </div>
      <div class="page-header__actions">
        @if (result(); as page) {
          <span class="muted">{{ page.total }} usuário(s)</span>
        }
      </div>
    </div>

    <div class="filters card card--tight mb-4">
      <div class="field">
        <label class="field__label" for="roleFilter">Papel</label>
        <select id="roleFilter" class="select" [value]="roleFilter()" (change)="applyFilter('role', $event)">
          <option value="">Todos</option>
          @for (role of roles(); track role.id) {
            <option [value]="role.name">{{ roleLabel(role.name) }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label class="field__label" for="companyFilter">Empresa</label>
        <select id="companyFilter" class="select" [value]="companyFilter()" (change)="applyFilter('companyId', $event)">
          <option value="">Todas</option>
          @for (company of companies(); track company.id) {
            <option [value]="company.id">{{ company.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label class="field__label" for="activeFilter">Situação</label>
        <select id="activeFilter" class="select" [value]="activeFilter()" (change)="applyFilter('isActive', $event)">
          <option value="">Todas</option>
          <option value="true">Ativos</option>
          <option value="false">Desativados</option>
        </select>
      </div>

      <div class="field">
        <span class="field__label">&nbsp;</span>
        <button type="button" class="btn" (click)="clearFilters()">Limpar filtros</button>
      </div>
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert [message]="error()" kind="error" /></div>
    }

    @if (loading()) {
      <app-loading label="Carregando usuários…" />
    } @else if (result()!.data.length) {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Usuário</th>
              <th>Papel</th>
              <th>Empresa</th>
              <th>Situação</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (user of result()!.data; track user.id) {
              <tr>
                <td class="cell-sub">{{ user.id }}</td>
                <td>
                  <div class="cell-title">
                    {{ user.name }}
                    @if (user.id === currentUserId()) {
                      <span class="badge badge--neutral">você</span>
                    }
                  </div>
                  <div class="cell-sub">{{ user.email }}</div>
                </td>
                <td>
                  <span class="badge" [class]="roleBadgeClass(user.role.name)">{{ roleLabel(user.role.name) }}</span>
                </td>
                <td>{{ companyName(user) }}</td>
                <td>
                  @if (user.isActive) {
                    <span class="badge badge--success">Ativo</span>
                  } @else {
                    <span class="badge badge--muted">Desativado</span>
                  }
                </td>
                <td class="nowrap">{{ date(user.createdAt) }}</td>
                <td class="actions">
                  <div class="btn-group" style="justify-content: flex-end">
                    <button
                      type="button"
                      class="btn btn--sm"
                      (click)="openRole(user)"
                      [disabled]="busy() || rolesUnavailable()"
                      [title]="rolesUnavailable() ? 'Não foi possível carregar os papéis do sistema' : null"
                    >
                      Papel
                    </button>
                    <button
                      type="button"
                      class="btn btn--sm"
                      (click)="openCompany(user)"
                      [disabled]="busy() || user.role.name !== 'RECRUITER'"
                      [title]="user.role.name === 'RECRUITER' ? null : 'Só recrutadores podem ser vinculados a empresa'"
                    >
                      Empresa
                    </button>
                    <button
                      type="button"
                      class="btn btn--sm"
                      [class.btn--outline-danger]="user.isActive"
                      (click)="askToggle(user)"
                      [disabled]="busy() || user.id === currentUserId()"
                      [title]="user.id === currentUserId() ? 'Não é possível desativar a própria conta' : null"
                    >
                      {{ user.isActive ? 'Desativar' : 'Reativar' }}
                    </button>
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
        label="usuários"
        (pageChange)="changePage($event)"
      />
    } @else if (!error()) {
      <app-empty-state
        icon="user"
        title="Nenhum usuário com esses filtros"
        description="Ajuste o papel, a empresa ou a situação para ver outras contas."
      >
        <button type="button" class="btn" (click)="clearFilters()">Limpar filtros</button>
      </app-empty-state>
    }

    <!-- Desativar / reativar ------------------------------------------------ -->
    @if (confirmTarget(); as user) {
      <app-confirm-dialog
        [title]="user.isActive ? 'Desativar usuário' : 'Reativar usuário'"
        [message]="confirmMessage(user)"
        [warning]="
          user.isActive
            ? 'Desativar bloqueia o acesso do usuário imediatamente. A conta pode ser reativada depois.'
            : null
        "
        [confirmLabel]="user.isActive ? 'Desativar' : 'Reativar'"
        [tone]="user.isActive ? 'danger' : 'primary'"
        [busy]="busy()"
        (confirmed)="toggle(user)"
        (cancelled)="confirmTarget.set(null)"
      />
    }

    <!-- Trocar papel -------------------------------------------------------- -->
    @if (roleTarget(); as user) {
      <app-modal title="Alterar papel" [subtitle]="user.name + ' · ' + user.email" (closed)="roleTarget.set(null)">
        <form class="form" [formGroup]="roleForm" (ngSubmit)="confirmRole()" novalidate>
          @if (roles().length === 0) {
            <app-alert
              kind="error"
              message="Não foi possível carregar os papéis do sistema."
              detail="Sem o catálogo de papéis (GET /roles) esta troca não pode ser feita com segurança. Recarregue a página ou verifique a permissão role:manage do seu papel."
            />
          }
          <div class="field">
            <label class="field__label" for="roleId">Novo papel</label>
            <select id="roleId" class="select" formControlName="roleId">
              @for (role of roles(); track role.id) {
                <option [ngValue]="role.id">{{ roleLabel(role.name) }} — {{ role.name }}</option>
              }
            </select>
            <span class="field__hint">
              A mudança vale na hora, sem necessidade de novo login.
            </span>
          </div>

          @if (user.role.name === 'RECRUITER') {
            <div class="alert alert--warning">
              <span class="alert__icon" aria-hidden="true">!</span>
              <div class="alert__body">
                Se este recrutador tiver vagas ativas, a troca de papel será recusada até que elas sejam encerradas.
              </div>
            </div>
          }

          @if (actionError()) {
            <app-alert [message]="actionError()" kind="error" />
          }

          <div class="modal__footer">
            <button type="button" class="btn" (click)="roleTarget.set(null)">Cancelar</button>
            <button type="submit" class="btn btn--primary" [disabled]="busy() || roles().length === 0">Salvar</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Trocar empresa ------------------------------------------------------ -->
    @if (companyTarget(); as user) {
      <app-modal
        title="Alterar empresa do recrutador"
        [subtitle]="user.name + ' · ' + user.email"
        (closed)="companyTarget.set(null)"
      >
        <form class="form" [formGroup]="companyForm" (ngSubmit)="confirmCompany()" novalidate>
          <div class="field">
            <label class="field__label" for="companyId">Empresa</label>
            <select id="companyId" class="select" formControlName="companyId">
              <option [ngValue]="null">Sem vínculo</option>
              @for (company of companies(); track company.id) {
                <option [ngValue]="company.id">{{ company.name }} (#{{ company.id }})</option>
              }
            </select>
            <span class="field__hint">
              Sem vínculo, o recrutador não consegue criar nem listar vagas.
            </span>
          </div>

          @if (actionError()) {
            <app-alert [message]="actionError()" kind="error" />
          }

          <div class="modal__footer">
            <button type="button" class="btn" (click)="companyTarget.set(null)">Cancelar</button>
            <button type="submit" class="btn btn--primary" [disabled]="busy()">Salvar</button>
          </div>
        </form>
      </app-modal>
    }
  `,
  styles: [
    `
      .filters {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
        gap: var(--space-4);
        align-items: end;
      }

      @media (max-width: 900px) {
        .filters {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class UsersPageComponent {
  private readonly usersService = inject(UsersService);
  private readonly rolesService = inject(RolesService);
  private readonly directory = inject(CompanyDirectoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly result = signal<Paginated<UserSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly roles = signal<Role[]>([]);
  protected readonly companies = signal<Company[]>([]);
  /** Catálogo de papéis indisponível (ex.: permissão `role:manage` removida). */
  protected readonly rolesUnavailable = signal(false);

  protected readonly roleFilter = signal('');
  protected readonly companyFilter = signal('');
  protected readonly activeFilter = signal('');

  protected readonly confirmTarget = signal<UserSummary | null>(null);
  protected readonly roleTarget = signal<UserSummary | null>(null);
  protected readonly companyTarget = signal<UserSummary | null>(null);

  protected readonly roleForm = this.fb.group({ roleId: this.fb.control<number | null>(null) });
  protected readonly companyForm = this.fb.group({ companyId: this.fb.control<number | null>(null) });

  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? null);

  constructor() {
    forkJoin({
      roles: this.rolesService.list().pipe(
        catchError(() => {
          this.rolesUnavailable.set(true);
          return of<Role[]>([]);
        }),
      ),
      companies: this.directory.discoverCompanies().pipe(catchError(() => of<Company[]>([]))),
    })
      .pipe(take(1))
      .subscribe(({ roles, companies }) => {
        this.roles.set(roles);
        this.companies.set(companies);
      });

    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(),
        tap((params) => {
          this.roleFilter.set(params.get('role') ?? '');
          this.companyFilter.set(params.get('companyId') ?? '');
          this.activeFilter.set(params.get('isActive') ?? '');
        }),
        switchMap(() =>
          this.usersService.list({
            page: Number(this.route.snapshot.queryParamMap.get('page') ?? 1) || 1,
            limit: 10,
            role: this.roleFilter() || undefined,
            companyId: this.companyFilter() ? Number(this.companyFilter()) : undefined,
            isActive: this.activeFilter() === '' ? undefined : this.activeFilter() === 'true',
          }),
        ),
      )
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
          this.error.set(null);
          this.directory.load(page.data.map((user) => user.companyId)).subscribe();
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(apiError.message);
        },
      });
  }

  // -------------------------------------------------------------------------
  // Filtros / paginação
  // -------------------------------------------------------------------------

  protected applyFilter(key: 'role' | 'companyId' | 'isActive', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected clearFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { role: null, companyId: null, isActive: null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected changePage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge' });
  }

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  protected askToggle(user: UserSummary): void {
    this.actionError.set(null);
    this.confirmTarget.set(user);
  }

  protected confirmMessage(user: UserSummary): string {
    return user.isActive
      ? `Desativar a conta de ${user.name} (${user.email})?`
      : `Reativar a conta de ${user.name} (${user.email})?`;
  }

  protected toggle(user: UserSummary): void {
    this.busy.set(true);
    this.actionError.set(null);

    const request = user.isActive ? this.usersService.deactivate(user.id) : this.usersService.reactivate(user.id);

    request.pipe(take(1)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.confirmTarget.set(null);
        this.patchRow(updated);
        this.toasts.success(updated.isActive ? 'Usuário reativado.' : 'Usuário desativado.');
      },
      error: (apiError: ApiError) => {
        this.busy.set(false);
        this.confirmTarget.set(null);
        this.toasts.error(apiError.message);
      },
    });
  }

  protected openRole(user: UserSummary): void {
    this.actionError.set(null);
    this.roleForm.reset({ roleId: user.roleId });
    this.roleTarget.set(user);
  }

  protected confirmRole(): void {
    const user = this.roleTarget();
    const roleId = this.roleForm.getRawValue().roleId;
    if (!user || roleId === null || this.busy()) return;

    this.busy.set(true);
    this.actionError.set(null);

    this.usersService
      .changeRole(user.id, roleId)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.roleTarget.set(null);
          this.patchRow(updated);
          this.toasts.success(`Papel de ${updated.name} alterado para ${this.roleLabel(updated.role.name)}.`);
        },
        error: (apiError: ApiError) => {
          this.busy.set(false);
          this.actionError.set(apiError.message);
        },
      });
  }

  protected openCompany(user: UserSummary): void {
    this.actionError.set(null);
    this.companyForm.reset({ companyId: user.companyId });
    this.companyTarget.set(user);
  }

  protected confirmCompany(): void {
    const user = this.companyTarget();
    if (!user || this.busy()) return;
    // `companyId` é obrigatório no corpo (pode ser `null` para desvincular).
    const companyId = this.companyForm.getRawValue().companyId;

    this.busy.set(true);
    this.actionError.set(null);

    this.usersService
      .changeCompany(user.id, companyId)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.companyTarget.set(null);
          this.patchRow(updated);
          this.toasts.success('Vínculo com empresa atualizado.');
        },
        error: (apiError: ApiError) => {
          this.busy.set(false);
          this.actionError.set(apiError.message);
        },
      });
  }

  private patchRow(updated: UserSummary): void {
    const page = this.result();
    if (!page) return;
    this.result.set({ ...page, data: page.data.map((user) => (user.id === updated.id ? updated : user)) });
  }

  // -------------------------------------------------------------------------
  // Apresentação
  // -------------------------------------------------------------------------

  protected roleLabel(role: string): string {
    return roleLabelText(role);
  }

  protected roleBadgeClass(role: string): string {
    switch (role) {
      case 'ADMIN':
        return 'badge badge--danger';
      case 'RECRUITER':
        return 'badge badge--info';
      default:
        return 'badge badge--neutral';
    }
  }

  protected companyName(user: UserSummary): string {
    if (!user.companyId) return '—';
    return this.directory.name(user.companyId) || `Empresa #${user.companyId}`;
  }

  protected date(iso: string): string {
    return formatDate(iso);
  }
}

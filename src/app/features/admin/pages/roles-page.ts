import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { roleLabel } from '../../../core/format';
import type { Permission, Role } from '../../../core/models';
import { RolesService } from '../../../core/services/users.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';

/**
 * Papéis e permissões (RBAC dinâmico) — `GET /roles` e
 * `PUT /roles/:id/permissions`.
 *
 * O `PUT` substitui o conjunto COMPLETO de permissões do papel e tem efeito
 * imediato (o backend recalcula as permissões do banco a cada request, sem
 * exigir novo login). Dois `409` estão tratados aqui:
 * - `sem_papel_com_role_manage`: o sistema ficaria sem nenhum papel capaz de
 *   gerenciar papéis;
 * - `concorrencia_transacao`: dois `PUT` simultâneos (transação Serializable) —
 *   é retryável, então a UI oferece "tentar de novo".
 *
 * Limitação honesta do contrato: o backend não expõe `GET /permissions`, então
 * o catálogo editável é a união das permissões que já aparecem nos papéis
 * existentes (as 28 do seed).
 */
@Component({
  selector: 'app-roles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AlertComponent, LoadingComponent],
  template: `
    <div class="page-header">
      <div class="page-header__titles">
        <h1>Papéis e permissões</h1>
        <p class="page-header__subtitle mb-0">
          Alterações valem imediatamente — inclusive para quem já está logado.
        </p>
      </div>
      <div class="page-header__actions">
        <button type="button" class="btn btn--sm" (click)="load()" [disabled]="loading()">Recarregar</button>
      </div>
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert [message]="error()" kind="error" /></div>
    }

    @if (loading()) {
      <app-loading label="Carregando papéis…" />
    } @else {
      <div class="roles">
        <nav class="roles__list card card--tight">
          <div class="section-title">Papéis ({{ roles().length }})</div>
          @for (role of roles(); track role.id) {
            <button
              type="button"
              class="role-item"
              [class.role-item--active]="selectedId() === role.id"
              (click)="select(role.id)"
            >
              <span class="role-item__name">{{ label(role.name) }}</span>
              <span class="role-item__meta">
                {{ role.name }} · {{ role.permissions.length }} permissão(ões)
                @if (role.isSystem) {
                  · sistema
                }
              </span>
            </button>
          }
        </nav>

        <section class="card">
          @if (selected(); as role) {
            <div class="card__header">
              <div>
                <div class="card__title">{{ label(role.name) }}</div>
                <div class="card__hint">
                  <code>{{ role.name }}</code>
                  @if (role.description) {
                    · {{ role.description }}
                  }
                </div>
              </div>
              <span class="badge" [class.badge--info]="dirty()" [class.badge--neutral]="!dirty()">
                {{ granted().size }} de {{ catalog().length }} selecionadas
              </span>
            </div>

            @if (roleError()) {
              <div class="mb-4"><app-alert [message]="roleError()" kind="error" /></div>
            }
            @if (role.isSystem) {
              <div class="alert alert--warning mb-4">
                <span class="alert__icon" aria-hidden="true">!</span>
                <div class="alert__body">
                  Papel de sistema: é protegido contra alterações que deixariam a plataforma sem administração.
                </div>
              </div>
            }

            <div class="groups">
              @for (group of groups(); track group.resource) {
                <fieldset class="group">
                  <legend class="group__legend">
                    <span class="strong">{{ group.resource }}</span>
                    <span class="cell-sub">{{ group.selectedCount }}/{{ group.permissions.length }}</span>
                    <button type="button" class="btn btn--sm btn--ghost" (click)="toggleGroup(group, true)">
                      marcar todas
                    </button>
                    <button type="button" class="btn btn--sm btn--ghost" (click)="toggleGroup(group, false)">
                      limpar
                    </button>
                  </legend>

                  <div class="group__items">
                    @for (permission of group.permissions; track permission.id) {
                      <label class="checkbox permission">
                        <input
                          type="checkbox"
                          [checked]="granted().has(permission.id)"
                          (change)="togglePermission(permission, $event)"
                          [disabled]="saving()"
                        />
                        <span>
                          <code>{{ permission.key }}</code>
                          @if (permission.description) {
                            <span class="permission__desc">{{ permission.description }}</span>
                          }
                        </span>
                      </label>
                    }
                  </div>
                </fieldset>
              }
            </div>

            <div class="row row--end mt-5">
              <button type="button" class="btn" (click)="select(role.id)" [disabled]="saving() || !dirty()">
                Descartar
              </button>
              <button type="button" class="btn btn--primary" (click)="save(role)" [disabled]="saving() || !dirty()">
                @if (saving()) {
                  <span class="spinner" aria-hidden="true"></span>
                  Salvando…
                } @else {
                  Salvar permissões
                }
              </button>
            </div>
          } @else {
            <p class="muted mb-0">Selecione um papel à esquerda para editar as permissões.</p>
          }
        </section>
      </div>
    }
  `,
  styles: [
    `
      .roles {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: var(--space-4);
        align-items: start;
      }

      .roles__list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        position: sticky;
        top: calc(var(--header-height) + 24px);
      }

      .role-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: left;
        padding: var(--space-2) var(--space-3);
        border: 1px solid transparent;
        border-radius: var(--radius);
        background: transparent;
        cursor: pointer;
        font: inherit;
      }

      .role-item:hover {
        background: var(--color-surface-alt);
      }

      .role-item--active {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
      }

      .role-item__name {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .role-item__meta {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }

      .groups {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .group {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-3) var(--space-4) var(--space-4);
        margin: 0;
      }

      .group__legend {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding-inline: var(--space-2);
        font-size: 0.8125rem;
        text-transform: capitalize;
      }

      .group__items {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: var(--space-2) var(--space-4);
      }

      .permission {
        align-items: flex-start;
        gap: var(--space-2);
      }

      .permission span {
        display: flex;
        flex-direction: column;
      }

      .permission__desc {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      @media (max-width: 900px) {
        .roles {
          grid-template-columns: minmax(0, 1fr);
        }

        .roles__list {
          position: static;
        }
      }
    `,
  ],
})
export class RolesPageComponent {
  private readonly rolesService = inject(RolesService);
  private readonly toasts = inject(ToastService);

  protected readonly roles = signal<Role[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly roleError = signal<string | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly granted = signal<Set<number>>(new Set());
  protected readonly original = signal<Set<number>>(new Set());

  protected readonly selected = computed(() => this.roles().find((role) => role.id === this.selectedId()) ?? null);

  protected readonly dirty = computed(() => {
    const granted = this.granted();
    const original = this.original();
    if (granted.size !== original.size) return true;
    for (const id of granted) {
      if (!original.has(id)) return true;
    }
    return false;
  });

  /** União das permissões conhecidas (o backend não tem GET /permissions). */
  protected readonly catalog = computed<Permission[]>(() => {
    const byId = new Map<number, Permission>();
    this.roles().forEach((role) => role.permissions.forEach((permission) => byId.set(permission.id, permission)));
    return [...byId.values()].sort((a, b) => a.key.localeCompare(b.key));
  });

  protected readonly groups = computed(() => {
    const granted = this.granted();
    const byResource = new Map<string, Permission[]>();
    this.catalog().forEach((permission) => {
      const resource = permission.key.split(':')[0] ?? 'outros';
      byResource.set(resource, [...(byResource.get(resource) ?? []), permission]);
    });

    return [...byResource.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([resource, permissions]) => ({
        resource,
        permissions,
        selectedCount: permissions.filter((permission) => granted.has(permission.id)).length,
      }));
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.rolesService
      .list()
      .pipe(take(1))
      .subscribe({
        next: (roles) => {
          this.roles.set(roles);
          this.loading.set(false);
          const selected = this.selectedId() ?? roles[0]?.id ?? null;
          if (selected !== null) {
            // Preserva o aviso pendente (ex.: 409 de concorrência acabou de
            // acontecer e o admin precisa ler antes de tentar de novo).
            const pendingError = this.roleError();
            this.select(selected);
            this.roleError.set(pendingError);
          }
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(apiError.message);
        },
      });
  }

  protected select(roleId: number | null): void {
    this.selectedId.set(roleId);
    this.roleError.set(null);
    const role = this.roles().find((item) => item.id === roleId);
    const ids = new Set((role?.permissions ?? []).map((permission) => permission.id));
    this.granted.set(new Set(ids));
    this.original.set(new Set(ids));
  }

  protected togglePermission(permission: Permission, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.granted.update((current) => {
      const next = new Set(current);
      if (checked) next.add(permission.id);
      else next.delete(permission.id);
      return next;
    });
  }

  protected toggleGroup(group: { permissions: Permission[] }, checked: boolean): void {
    this.granted.update((current) => {
      const next = new Set(current);
      group.permissions.forEach((permission) => (checked ? next.add(permission.id) : next.delete(permission.id)));
      return next;
    });
  }

  protected save(role: Role): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.roleError.set(null);

    this.rolesService
      .updatePermissions(role.id, [...this.granted()])
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.roles.update((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          this.select(updated.id);
          this.toasts.success(
            `Permissões de "${this.label(updated.name)}" atualizadas.`,
            'Efeito imediato, sem novo login.',
          );
        },
        error: (apiError: ApiError) => {
          this.saving.set(false);

          if (apiError.reason === 'concorrencia_transacao') {
            // Conflito retryável (transação Serializable do backend): recarrega
            // os papéis para o admin ver o estado atual e mantém o aviso.
            const message = `${apiError.message} Outra alteração de permissões estava em andamento — clique em "Salvar permissões" novamente.`;
            this.load();
            this.roleError.set(message);
            return;
          }

          this.roleError.set(apiError.message);
        },
      });
  }

  protected label(role: string): string {
    return roleLabel(role);
  }
}

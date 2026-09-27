import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { ListQuery, Paginated, Permission, Role, UserSummary } from '../models';

export interface UsersQuery extends ListQuery {
  /** Nome do papel (ex.: `ADMIN`, `RECRUITER`, `CANDIDATE` ou papel custom). */
  role?: string;
  companyId?: number;
  isActive?: boolean;
}

/** Gestão de usuários (ADMIN). */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(ApiClient);

  list(query: UsersQuery = {}): Observable<Paginated<UserSummary>> {
    return this.api.get<Paginated<UserSummary>>('users', {
      page: query.page,
      limit: query.limit,
      role: query.role,
      companyId: query.companyId,
      isActive: query.isActive === undefined ? undefined : String(query.isActive),
      sortOrder: query.sortOrder,
    });
  }

  get(id: number): Observable<UserSummary> {
    return this.api.get<UserSummary>(`users/${id}`);
  }

  deactivate(id: number): Observable<UserSummary> {
    return this.api.patch<UserSummary>(`users/${id}/deactivate`);
  }

  reactivate(id: number): Observable<UserSummary> {
    return this.api.patch<UserSummary>(`users/${id}/reactivate`);
  }

  /** `null` desvincula a empresa (só faz sentido para RECRUITER). */
  changeCompany(id: number, companyId: number | null): Observable<UserSummary> {
    return this.api.patch<UserSummary>(`users/${id}/company`, { companyId });
  }

  changeRole(id: number, roleId: number): Observable<UserSummary> {
    return this.api.patch<UserSummary>(`users/${id}/role`, { roleId });
  }
}

/** Papéis e permissões (RBAC dinâmico — ADMIN). */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly api = inject(ApiClient);

  list(): Observable<Role[]> {
    return this.api.get<Role[]>('roles');
  }

  get(id: number): Observable<Role> {
    return this.api.get<Role>(`roles/${id}`);
  }

  /**
   * Substitui o conjunto COMPLETO de permissões do papel.
   *
   * Efeito imediato (as permissões são recalculadas do banco a cada request,
   * sem novo login). O backend protege dois casos com `409`: deixar o sistema
   * sem nenhum papel com `role:manage` e concorrência entre dois `PUT`
   * simultâneos (retryável).
   */
  updatePermissions(id: number, permissionIds: number[]): Observable<Role> {
    return this.api.put<Role>(`roles/${id}/permissions`, { permissionIds });
  }
}

export type { Permission };

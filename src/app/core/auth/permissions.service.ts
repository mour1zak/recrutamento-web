import { Injectable, computed, inject } from '@angular/core';
import type { RoleName } from '../models';
import { AuthService } from './auth.service';

/**
 * Catálogo de permission keys do backend (`src/common/constants/permissions.constants.ts`).
 * Mantido aqui só para a UI decidir o que mostrar — a autorização de verdade
 * continua no backend (PermissionsGuard + RBAC lido do banco a cada request).
 */
export const PERMISSIONS = {
  COMPANY_CREATE: 'company:create',
  COMPANY_READ: 'company:read',
  COMPANY_UPDATE: 'company:update',
  COMPANY_DELETE: 'company:delete',
  JOB_CREATE: 'job:create',
  JOB_READ: 'job:read',
  JOB_READ_ANY: 'job:read:any',
  JOB_UPDATE: 'job:update',
  JOB_DELETE: 'job:delete',
  JOB_STATUS_UPDATE: 'job:status:update',
  APPLICATION_CREATE: 'application:create',
  APPLICATION_READ_OWN: 'application:read:own',
  APPLICATION_READ_JOB: 'application:read:job',
  APPLICATION_READ_ANY: 'application:read:any',
  APPLICATION_STATUS_UPDATE: 'application:status:update',
  APPLICATION_WITHDRAW_OWN: 'application:withdraw:own',
  CANDIDATE_PROFILE_READ: 'candidate-profile:read',
  CANDIDATE_PROFILE_UPDATE_OWN: 'candidate-profile:update:own',
  INTERVIEW_CREATE: 'interview:create',
  INTERVIEW_READ: 'interview:read',
  INTERVIEW_UPDATE: 'interview:update',
  DOCUMENT_UPLOAD_OWN: 'document:upload:own',
  DOCUMENT_READ_OWN: 'document:read:own',
  DOCUMENT_READ_APPLICATION: 'document:read:application',
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  APIKEY_MANAGE: 'apikey:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Distribuição padrão criada pelo seed do backend (ROLE_PERMISSIONS). */
const CANDIDATE_ONLY: PermissionKey[] = [
  PERMISSIONS.APPLICATION_CREATE,
  PERMISSIONS.APPLICATION_WITHDRAW_OWN,
  PERMISSIONS.CANDIDATE_PROFILE_UPDATE_OWN,
  PERMISSIONS.DOCUMENT_UPLOAD_OWN,
];

const CANDIDATE_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.JOB_READ,
  PERMISSIONS.APPLICATION_CREATE,
  PERMISSIONS.APPLICATION_READ_OWN,
  PERMISSIONS.APPLICATION_WITHDRAW_OWN,
  PERMISSIONS.CANDIDATE_PROFILE_READ,
  PERMISSIONS.CANDIDATE_PROFILE_UPDATE_OWN,
  PERMISSIONS.DOCUMENT_UPLOAD_OWN,
  PERMISSIONS.DOCUMENT_READ_OWN,
];

const RECRUITER_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.COMPANY_READ,
  PERMISSIONS.JOB_CREATE,
  PERMISSIONS.JOB_READ,
  PERMISSIONS.JOB_READ_ANY,
  PERMISSIONS.JOB_UPDATE,
  PERMISSIONS.JOB_STATUS_UPDATE,
  PERMISSIONS.APPLICATION_READ_JOB,
  PERMISSIONS.APPLICATION_STATUS_UPDATE,
  PERMISSIONS.CANDIDATE_PROFILE_READ,
  PERMISSIONS.INTERVIEW_CREATE,
  PERMISSIONS.INTERVIEW_READ,
  PERMISSIONS.INTERVIEW_UPDATE,
  PERMISSIONS.DOCUMENT_READ_APPLICATION,
];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionKey[];
const ADMIN_PERMISSIONS: PermissionKey[] = ALL_PERMISSIONS.filter((key) => !CANDIDATE_ONLY.includes(key));

const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  CANDIDATE: CANDIDATE_PERMISSIONS,
  RECRUITER: RECRUITER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
};

/**
 * Espelho client-side do RBAC do backend.
 *
 * Por que existe: o briefing pede que um `403` idealmente nunca apareça — a UI
 * deve esconder o botão/ação que o usuário não pode executar. O login devolve
 * só `{id, name, email, role}`, então as permissões são derivadas do papel
 * (mesma distribuição do seed). Se um ADMIN editar as permissões de um papel
 * em runtime na tela de Papéis, o backend passa a valer imediatamente; a UI
 * pode ficar desatualizada até o próximo login — e nesse caso o erro aparece
 * traduzido, sem quebrar nada.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly auth = inject(AuthService);

  /** Papel do usuário logado (`null` = visitante). */
  readonly role = computed<RoleName | null>(() => this.auth.user()?.role ?? null);

  readonly permissions = computed<PermissionKey[]>(() => {
    const role = this.role();
    if (!role) return [];
    return ROLE_PERMISSIONS[role] ?? [];
  });

  can(permission: PermissionKey): boolean {
    return this.permissions().includes(permission);
  }

  canAny(...permissions: PermissionKey[]): boolean {
    const current = this.permissions();
    return permissions.some((permission) => current.includes(permission));
  }

  isCandidate(): boolean {
    return this.role() === 'CANDIDATE';
  }

  isRecruiter(): boolean {
    return this.role() === 'RECRUITER';
  }

  isAdmin(): boolean {
    return this.role() === 'ADMIN';
  }
}

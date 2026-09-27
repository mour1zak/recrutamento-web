import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, roleGuard } from './core/guards/auth.guards';
import { PERMISSIONS } from './core/auth/permissions.service';
import { AuthService, homePathForRole } from './core/auth/auth.service';
import { ShellComponent } from './layout/shell';

/**
 * Raiz do site: visitante cai na vitrine pública; usuário logado vai direto
 * para a home do próprio papel (candidato → vagas, recrutador → painel,
 * admin → administração).
 */
const rootRedirect: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return router.createUrlTree([auth.isAuthenticated() ? homePathForRole(auth.role()) : '/jobs']);
};

/**
 * Rotas por feature (lazy) — auth, jobs, candidate, recruiter, admin.
 *
 * Convenções:
 * - rotas públicas: `/`, `/jobs`, `/jobs/:id`, `/auth/*`;
 * - área do candidato: `/candidate/*` (guard de papel + permission key);
 * - área do recrutador: `/recruiter/*` (ADMIN também entra — tem `job:read:any`);
 * - administração: `/admin/*` (ADMIN).
 *
 * Os guards usam o papel E o espelho client-side das permission keys, para que
 * uma ação proibida nem seja oferecida (o `403` "idealmente nem aparece").
 */
export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', canActivate: [rootRedirect], children: [] },

      // ------------------------------------------------------------------
      // Autenticação (só para visitantes)
      // ------------------------------------------------------------------
      {
        path: 'auth',
        canActivate: [guestGuard],
        loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
      },

      // ------------------------------------------------------------------
      // Vagas (vitrine pública + detalhe)
      // ------------------------------------------------------------------
      {
        path: 'jobs',
        loadChildren: () => import('./features/jobs/jobs.routes').then((m) => m.JOBS_ROUTES),
      },

      // ------------------------------------------------------------------
      // Área do candidato
      // ------------------------------------------------------------------
      {
        path: 'candidate',
        canActivate: [authGuard, permissionGuard(PERMISSIONS.APPLICATION_READ_OWN)],
        loadChildren: () => import('./features/candidate/candidate.routes').then((m) => m.CANDIDATE_ROUTES),
      },

      // ------------------------------------------------------------------
      // Área do recrutador (ADMIN também opera vagas/candidaturas)
      // ------------------------------------------------------------------
      {
        path: 'recruiter',
        canActivate: [authGuard, roleGuard('RECRUITER', 'ADMIN')],
        loadChildren: () => import('./features/recruiter/recruiter.routes').then((m) => m.RECRUITER_ROUTES),
      },

      // ------------------------------------------------------------------
      // Administração
      // ------------------------------------------------------------------
      {
        path: 'admin',
        canActivate: [authGuard, roleGuard('ADMIN')],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },

      {
        path: '404',
        title: 'Não encontrado — Recruta',
        loadComponent: () => import('./features/not-found-page').then((m) => m.NotFoundPageComponent),
      },
      { path: '**', redirectTo: '404' },
    ],
  },
];

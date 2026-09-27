import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeIfAuthedGuard, permissionGuard, roleGuard } from './core/guards/auth.guards';
import { PERMISSIONS } from './core/auth/permissions.service';
import { ShellComponent } from './layout/shell';

/**
 * Rotas por feature (lazy) — auth, jobs, candidate, recruiter, admin.
 *
 * Convenções:
 * - rotas públicas: `/` (landing) e `/auth/*`; o conteúdo (`/jobs`, áreas)
 *   exige sessão — decisão de produto estilo portal (ver briefing de UX);
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
      // Porta de entrada estilo portal: landing pública; o conteúdo (vitas,
      // candidaturas, painéis) só depois do login.
      {
        path: '',
        pathMatch: 'full',
        title: 'Recruta — Plataforma de Recrutamento',
        canActivate: [homeIfAuthedGuard],
        loadComponent: () => import('./features/landing/landing-page').then((m) => m.LandingPageComponent),
      },

      // ------------------------------------------------------------------
      // Autenticação (só para visitantes)
      // ------------------------------------------------------------------
      {
        path: 'auth',
        canActivate: [guestGuard],
        loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
      },

      // ------------------------------------------------------------------
      // Vagas (vitrine + detalhe) — conteúdo liberado após o login
      // ------------------------------------------------------------------
      {
        path: 'jobs',
        canActivate: [authGuard],
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

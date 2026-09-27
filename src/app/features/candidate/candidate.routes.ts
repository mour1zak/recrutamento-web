import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth.guards';
import { PERMISSIONS } from '../../core/auth/permissions.service';

/** Área do candidato. */
export const CANDIDATE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'applications' },
  {
    path: 'applications',
    title: 'Minhas candidaturas — Recruta',
    canActivate: [permissionGuard(PERMISSIONS.APPLICATION_READ_OWN)],
    loadComponent: () => import('./pages/my-applications-page').then((m) => m.MyApplicationsPageComponent),
  },
  {
    path: 'applications/:id',
    title: 'Candidatura — Recruta',
    canActivate: [permissionGuard(PERMISSIONS.APPLICATION_READ_OWN)],
    loadComponent: () => import('./pages/candidate-application-page').then((m) => m.CandidateApplicationPageComponent),
  },
  {
    path: 'profile',
    title: 'Meu perfil — Recruta',
    canActivate: [permissionGuard(PERMISSIONS.CANDIDATE_PROFILE_UPDATE_OWN)],
    loadComponent: () => import('./pages/profile-page').then((m) => m.ProfilePageComponent),
  },
];

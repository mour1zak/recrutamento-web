import { Routes } from '@angular/router';
import { PERMISSIONS } from '../../core/auth/permissions.service';
import { permissionGuard } from '../../core/guards/auth.guards';

/**
 * Área do recrutador (ADMIN também entra — tem as mesmas permission keys de
 * gestão de vagas/candidaturas, mais o escopo de todas as empresas).
 */
export const RECRUITER_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Painel do recrutador — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.COMPANY_READ)],
    loadComponent: () => import('./pages/recruiter-dashboard').then((m) => m.RecruiterDashboardComponent),
  },
  {
    path: 'jobs',
    title: 'Minhas vagas — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.JOB_READ_ANY)],
    loadComponent: () => import('./pages/my-jobs-page').then((m) => m.MyJobsPageComponent),
  },
  {
    path: 'jobs/new',
    title: 'Nova vaga — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.JOB_CREATE)],
    loadComponent: () => import('./pages/job-form-page').then((m) => m.JobFormPageComponent),
  },
  {
    path: 'jobs/:jobId',
    title: 'Candidaturas da vaga — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.APPLICATION_READ_JOB)],
    loadComponent: () => import('./pages/job-applications-page').then((m) => m.JobApplicationsPageComponent),
  },
  {
    path: 'jobs/:jobId/edit',
    title: 'Editar vaga — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.JOB_UPDATE)],
    loadComponent: () => import('./pages/job-form-page').then((m) => m.JobFormPageComponent),
  },
  {
    path: 'applications/:id',
    title: 'Candidatura — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.APPLICATION_READ_JOB)],
    loadComponent: () => import('./pages/recruiter-application-page').then((m) => m.RecruiterApplicationPageComponent),
  },
  {
    path: 'stats',
    title: 'Indicadores — Gipper',
    canActivate: [permissionGuard(PERMISSIONS.COMPANY_READ)],
    loadComponent: () => import('./pages/company-stats-page').then((m) => m.CompanyStatsPageComponent),
  },
];

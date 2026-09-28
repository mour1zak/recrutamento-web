import { Routes } from '@angular/router';

/**
 * Vagas. A vitrine (`/jobs`) é pública; o detalhe (`/jobs/:id`) também é
 * acessível sem login — o componente resolve pela listagem pública quando não
 * há sessão (o backend exige JWT em `GET /jobs/:id`).
 */
export const JOBS_ROUTES: Routes = [
  {
    path: '',
    title: 'Vagas abertas — LinklDoor',
    loadComponent: () => import('./pages/jobs-page').then((m) => m.JobsPageComponent),
  },
  {
    path: ':id',
    title: 'Vaga — LinklDoor',
    loadComponent: () => import('./pages/job-detail-page').then((m) => m.JobDetailPageComponent),
  },
];

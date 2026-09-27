import { Routes } from '@angular/router';

/** Rotas de autenticação (protegidas por `guestGuard` no nível pai). */
export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: 'Entrar — Recruta',
    loadComponent: () => import('./pages/login').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    title: 'Criar conta — Recruta',
    loadComponent: () => import('./pages/register').then((m) => m.RegisterPageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];

import { Routes } from '@angular/router';

/** Rotas de autenticação (protegidas por `guestGuard` no nível pai). */
export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: 'Entrar — Gipper',
    loadComponent: () => import('./pages/login').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    title: 'Criar conta — Gipper',
    loadComponent: () => import('./pages/register').then((m) => m.RegisterPageComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];

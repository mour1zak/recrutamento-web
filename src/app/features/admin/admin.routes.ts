import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './admin-layout';

/** Administração (papel ADMIN). */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'companies' },
      {
        path: 'companies',
        title: 'Empresas — Recruta',
        loadComponent: () => import('./pages/companies-page').then((m) => m.CompaniesPageComponent),
      },
      {
        path: 'companies/new',
        title: 'Nova empresa — Recruta',
        loadComponent: () => import('./pages/company-form-page').then((m) => m.CompanyFormPageComponent),
      },
      {
        path: 'companies/:id/edit',
        title: 'Editar empresa — Recruta',
        loadComponent: () => import('./pages/company-form-page').then((m) => m.CompanyFormPageComponent),
      },
      {
        path: 'users',
        title: 'Usuários — Recruta',
        loadComponent: () => import('./pages/users-page').then((m) => m.UsersPageComponent),
      },
      {
        path: 'roles',
        title: 'Papéis e permissões — Recruta',
        loadComponent: () => import('./pages/roles-page').then((m) => m.RolesPageComponent),
      },
    ],
  },
];

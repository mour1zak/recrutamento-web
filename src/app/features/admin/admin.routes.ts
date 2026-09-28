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
        title: 'Empresas — Gipper',
        loadComponent: () => import('./pages/companies-page').then((m) => m.CompaniesPageComponent),
      },
      {
        path: 'companies/new',
        title: 'Nova empresa — Gipper',
        loadComponent: () => import('./pages/company-form-page').then((m) => m.CompanyFormPageComponent),
      },
      {
        path: 'companies/:id/edit',
        title: 'Editar empresa — Gipper',
        loadComponent: () => import('./pages/company-form-page').then((m) => m.CompanyFormPageComponent),
      },
      {
        path: 'users',
        title: 'Usuários — Gipper',
        loadComponent: () => import('./pages/users-page').then((m) => m.UsersPageComponent),
      },
      {
        path: 'roles',
        title: 'Papéis e permissões — Gipper',
        loadComponent: () => import('./pages/roles-page').then((m) => m.RolesPageComponent),
      },
    ],
  },
];

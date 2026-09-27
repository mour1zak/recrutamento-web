import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Layout da área administrativa: menu lateral + conteúdo. */
@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="container page admin">
      <aside class="admin__side">
        <div class="section-title">Administração</div>
        <nav class="admin__nav">
          <a routerLink="/admin/companies" routerLinkActive="is-active">Empresas</a>
          <a routerLink="/admin/users" routerLinkActive="is-active">Usuários</a>
          <a routerLink="/admin/roles" routerLinkActive="is-active">Papéis e permissões</a>
        </nav>

        <div class="admin__note">
          <div class="section-title">Área de negócio</div>
          <nav class="admin__nav">
            <a routerLink="/recruiter/jobs" routerLinkActive="is-active">Todas as vagas</a>
            <a routerLink="/recruiter" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">
              Indicadores de empresa
            </a>
          </nav>
        </div>
      </aside>

      <section class="admin__content">
        <router-outlet />
      </section>
    </div>
  `,
  styles: [
    `
      .admin {
        display: grid;
        grid-template-columns: 230px minmax(0, 1fr);
        gap: var(--space-6);
        align-items: start;
      }

      .admin__side {
        position: sticky;
        top: calc(var(--header-height) + 24px);
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .admin__nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .admin__nav a {
        padding: 8px 12px;
        border-radius: var(--radius);
        color: var(--color-text-muted);
        font-size: 0.875rem;
        font-weight: 550;
      }

      .admin__nav a:hover {
        background: var(--color-surface);
        text-decoration: none;
      }

      .admin__nav a.is-active {
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
      }

      .admin__note {
        border-top: 1px solid var(--color-border);
        padding-top: var(--space-4);
      }

      .admin__content {
        min-width: 0;
      }

      @media (max-width: 900px) {
        .admin {
          grid-template-columns: minmax(0, 1fr);
        }

        .admin__side {
          position: static;
        }

        .admin__nav {
          flex-direction: row;
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class AdminLayoutComponent {}

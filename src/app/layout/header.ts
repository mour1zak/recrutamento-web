import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { roleLabel } from '../core/format';

interface NavItem {
  path: string;
  label: string;
  /** Rótulo alternativo quando o papel logado é ADMIN (escopo diferente). */
  adminLabel?: string;
  /** Só aparece se o usuário logado tiver este papel. */
  roles: string[];
  /** Visível também para visitantes (conteúdo público do produto). */
  public?: boolean;
  end?: boolean;
}

/**
 * Navegação por papel.
 *
 * Cada perfil enxerga o próprio menu: o ADMIN nunca vê "Minhas vagas" (para ele
 * a mesma tela lista as vagas de TODAS as empresas, então o rótulo é
 * "Todas as vagas"), e o visitante não vê menu nenhum — o conteúdo é liberado
 * após entrar (mesma lógica de portal do Glassdoor).
 */
const NAV_ITEMS: NavItem[] = [
  { path: '/jobs', label: 'Vagas', roles: ['CANDIDATE', 'RECRUITER', 'ADMIN'], public: true },
  { path: '/candidate/applications', label: 'Minhas candidaturas', roles: ['CANDIDATE'] },
  { path: '/candidate/profile', label: 'Meu perfil', roles: ['CANDIDATE'] },
  { path: '/recruiter', label: 'Painel', roles: ['RECRUITER'], end: true },
  { path: '/recruiter/jobs', label: 'Minhas vagas', adminLabel: 'Todas as vagas', roles: ['RECRUITER', 'ADMIN'] },
  { path: '/recruiter/stats', label: 'Indicadores', roles: ['RECRUITER', 'ADMIN'] },
  { path: '/admin/companies', label: 'Empresas', roles: ['ADMIN'] },
  { path: '/admin/users', label: 'Usuários', roles: ['ADMIN'] },
  { path: '/admin/roles', label: 'Papéis e permissões', roles: ['ADMIN'] },
];

/**
 * Cabeçalho global: marca, navegação por papel e área de sessão.
 *
 * A navegação é derivada do papel do usuário logado — é o que faz um `403`
 * nunca aparecer por clique em menu (pedido explícito do briefing).
 */
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="site-header">
      <div class="container site-header__inner">
        <a class="brand" routerLink="/">
          <span class="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M4 7h16M4 12h10M4 17h7" stroke-linecap="round" />
              <circle cx="18.5" cy="16.5" r="3.5" />
            </svg>
          </span>
          <span class="brand__name">LinklDoor</span>
        </a>

        <nav class="site-nav" aria-label="Navegação principal">
          @for (item of visibleItems(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.end }"
              >{{ item.label }}</a
            >
          }
        </nav>

        <div class="session">
          @if (auth.isAuthenticated()) {
            <div class="session__user" [title]="userEmail()">
              <span class="avatar" aria-hidden="true">{{ initials() }}</span>
              <span class="session__meta">
                <span class="session__name">{{ userName() }}</span>
                <span class="session__role">{{ roleText() }}</span>
              </span>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" (click)="logout()">Sair</button>
          } @else {
            <a class="btn btn--ghost btn--sm" routerLink="/auth/login">Entrar</a>
            <a class="btn btn--primary btn--sm" routerLink="/auth/register">Criar conta</a>
          }
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .site-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: rgb(255 255 255 / 92%);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--color-border);
      }

      .site-header__inner {
        display: flex;
        align-items: center;
        gap: var(--space-5);
        height: var(--header-height);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 1.05rem;
        color: var(--color-text);
        letter-spacing: -0.02em;
      }

      .brand:hover {
        text-decoration: none;
      }

      .brand__mark {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 9px;
        background: var(--color-primary);
        color: #fff;
      }

      .site-nav {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .site-nav::-webkit-scrollbar {
        display: none;
      }

      .site-nav a {
        padding: 7px 12px;
        border-radius: var(--radius);
        color: var(--color-text-muted);
        font-size: 0.875rem;
        font-weight: 550;
        white-space: nowrap;
      }

      .site-nav a:hover {
        background: var(--color-surface-alt);
        color: var(--color-text);
        text-decoration: none;
      }

      .site-nav a.is-active {
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
      }

      .session {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .session__user {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
      }

      .session__meta {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
        min-width: 0;
      }

      .session__name {
        font-size: 0.8125rem;
        font-weight: 600;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .session__role {
        font-size: 0.6875rem;
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .avatar {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        font-size: 0.75rem;
        font-weight: 700;
        flex: none;
      }

      @media (max-width: 720px) {
        .session__meta {
          display: none;
        }

        .site-header__inner {
          gap: var(--space-3);
        }
      }
    `,
  ],
})
export class HeaderComponent {
  protected readonly auth = inject(AuthService);

  protected readonly userName = computed(() => this.auth.user()?.name ?? '');
  protected readonly userEmail = computed(() => this.auth.user()?.email ?? '');
  protected readonly roleText = computed(() => roleLabel(this.auth.role()));

  protected readonly initials = computed(() => {
    const name = this.userName().trim();
    if (!name) return '?';
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
  });

  protected readonly visibleItems = computed(() => {
    const role = this.auth.role();
    const items = role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : NAV_ITEMS.filter((item) => item.public);
    return items.map((item) => ({
      path: item.path,
      label: role === 'ADMIN' && item.adminLabel ? item.adminLabel : item.label,
      end: item.end ?? false,
    }));
  });

  protected logout(): void {
    this.auth.logout({ navigateToLogin: false });
  }
}

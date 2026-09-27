import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Rodapé público, com linguagem de produto (o site é apresentado a um cliente
 * final: nada de termos técnicos como "frontend", "API" ou nome do repositório).
 */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="site-footer">
      <div class="container site-footer__inner">
        <div class="site-footer__brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M4 7h16M4 12h10M4 17h7" stroke-linecap="round" />
              <circle cx="18.5" cy="16.5" r="3.5" />
            </svg>
          </span>
          <div>
            <strong>Recruta</strong>
            <span class="site-footer__tagline">Conectando pessoas e oportunidades.</span>
          </div>
        </div>

        <span class="site-footer__copy">
          © 2026 Recruta. Encontre a vaga certa. Contrate a pessoa certa.
        </span>
      </div>
    </footer>
  `,
  styles: [
    `
      .site-footer {
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
        padding-block: var(--space-5);
        margin-top: var(--space-6);
        font-size: 0.8125rem;
      }

      .site-footer__inner {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3) var(--space-5);
        align-items: center;
        justify-content: space-between;
        color: var(--color-text-muted);
      }

      .site-footer__brand {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        background: var(--color-primary);
        color: #fff;
      }

      .site-footer__brand strong {
        color: var(--color-text);
        margin-right: 6px;
      }

      .site-footer__tagline {
        color: var(--color-text-muted);
      }

      .site-footer__copy {
        color: var(--color-text-subtle);
      }

      @media (max-width: 720px) {
        .site-footer__inner {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class FooterComponent {}

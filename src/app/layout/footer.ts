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
            <svg viewBox="0 0 32 32" width="26" height="26">
              <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--color-primary)" />
              <path
                d="M22.4 12.2a6.5 6.5 0 1 0 1.7 6.6h-5.6"
                fill="none"
                stroke="#ffffff"
                stroke-width="2.8"
                stroke-linecap="square"
              />
              <path d="M24.3 5.1l2.7 2.7-2.7 2.7-2.7-2.7z" fill="var(--color-accent)" />
            </svg>
          </span>
          <div>
            <strong>Gipper</strong>
            <span class="site-footer__tagline">Digital Recruitment — conectando pessoas e oportunidades.</span>
          </div>
        </div>

        <span class="site-footer__copy">
          © 2026 LinklDoor. Encontre a vaga certa. Contrate a pessoa certa.
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
      }

      .site-footer__brand strong {
        font-family: var(--font-display);
        font-weight: 800;
        letter-spacing: -0.02em;
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

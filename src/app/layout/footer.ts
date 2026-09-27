import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Rodapé simples com os atalhos públicos e a referência ao backend. */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <footer class="site-footer">
      <div class="container site-footer__inner">
        <div>
          <strong>Recruta</strong> — plataforma de recrutamento.
          <span class="muted">Frontend Angular consumindo a API <code>recrutamento-api</code>.</span>
        </div>
        <nav class="site-footer__nav" aria-label="Rodapé">
          <a routerLink="/jobs">Vagas abertas</a>
          <a routerLink="/auth/login">Entrar</a>
          <a routerLink="/auth/register">Criar conta</a>
        </nav>
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

      .site-footer__nav {
        display: flex;
        gap: var(--space-4);
      }
    `,
  ],
})
export class FooterComponent {}

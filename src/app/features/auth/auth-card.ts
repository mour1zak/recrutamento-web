import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cartão centralizado usado pelas telas de autenticação (login/cadastro). */
@Component({
  selector: 'app-auth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <div class="auth-card card">
        <div class="auth-card__head">
          <h1>{{ title() }}</h1>
          @if (subtitle()) {
            <p class="muted mb-0">{{ subtitle() }}</p>
          }
        </div>
        <ng-content />
      </div>
      <div class="auth-aside">
        <ng-content select="[authAside]" />
      </div>
    </div>
  `,
  styles: [
    `
      .auth-page {
        display: grid;
        grid-template-columns: minmax(0, 520px) minmax(0, 320px);
        gap: var(--space-6);
        align-items: start;
        justify-content: center;
        padding-block: var(--space-7);
      }

      .auth-card {
        padding: var(--space-6);
      }

      .auth-card__head {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-5);
      }

      .auth-aside {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      @media (max-width: 1024px) {
        .auth-page {
          grid-template-columns: minmax(0, 560px);
        }
      }
    `,
  ],
})
export class AuthCardComponent {
  readonly title = input('');
  readonly subtitle = input<string | null>(null);
}

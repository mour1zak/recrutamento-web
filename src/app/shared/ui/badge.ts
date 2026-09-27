import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BadgeTone } from '../../core/format';

/** Badge de status (job/candidatura/entrevista) — tom + rótulo. */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class]="badgeClass()" [attr.title]="title()">
      <ng-content>{{ label() }}</ng-content>
    </span>
  `,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  readonly label = input<string>('');
  readonly title = input<string | null>(null);
  /** Sem o ponto colorido (usado em contagens/métricas). */
  readonly plain = input(false);

  protected readonly badgeClass = computed(() => `badge--${this.tone()}${this.plain() ? ' badge--plain' : ''}`);
}

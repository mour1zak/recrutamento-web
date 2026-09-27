import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Estado vazio com call-to-action opcional (projeção de conteúdo). */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      @if (icon()) {
        <div class="empty-state__icon" aria-hidden="true">{{ icon() }}</div>
      }
      <div class="empty-state__title">{{ title() }}</div>
      @if (description()) {
        <p class="mb-0">{{ description() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input('Nada por aqui ainda');
  readonly description = input<string | null>(null);
  readonly icon = input<string | null>('◌');
}

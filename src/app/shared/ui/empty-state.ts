import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon';

/** Estado vazio com call-to-action opcional (projeção de conteúdo). */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="empty-state">
      @if (icon()) {
        <div class="empty-state__icon" aria-hidden="true">
          <app-icon [name]="icon()!" [size]="26" />
        </div>
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
  readonly icon = input<IconName | null>('search');
}

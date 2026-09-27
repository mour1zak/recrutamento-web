import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Bloco de carregamento padronizado (lista/detalhe). */
@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="loading-block" role="status" aria-live="polite">
      <span class="spinner spinner--dark"></span>
      <span>{{ label() }}</span>
    </div>
  `,
})
export class LoadingComponent {
  readonly label = input('Carregando…');
}

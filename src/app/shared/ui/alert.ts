import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type AlertKind = 'error' | 'warning' | 'info' | 'success';

/** Mensagem inline de erro/aviso (erros de API já traduzidos chegam aqui). */
@Component({
  selector: 'app-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message()) {
      <div class="alert" [class]="'alert--' + kind()" role="alert">
        <span class="alert__icon" aria-hidden="true">{{ icon() }}</span>
        <div class="alert__body">
          <span>{{ message() }}</span>
          @if (detail()) {
            <small class="muted">{{ detail() }}</small>
          }
        </div>
        @if (dismissible()) {
          <div class="alert__actions">
            <button type="button" class="icon-button" (click)="dismiss.emit()" aria-label="Fechar">×</button>
          </div>
        }
      </div>
    }
  `,
})
export class AlertComponent {
  readonly message = input<string | null>(null);
  readonly detail = input<string | null>(null);
  readonly kind = input<AlertKind>('error');
  readonly dismissible = input(false);
  readonly dismiss = output<void>();

  protected icon(): string {
    switch (this.kind()) {
      case 'success':
        return '✓';
      case 'warning':
        return '!';
      case 'info':
        return 'i';
      default:
        return '✕';
    }
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

/** Pilha de notificações globais (renderiza o que o `ToastService` publicar). */
@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      @for (toast of toasts.items(); track toast.id) {
        <div class="toast" [class]="'toast toast--' + toast.kind" role="status">
          <div>
            <div class="toast__message">{{ toast.message }}</div>
            @if (toast.detail) {
              <div class="toast__detail">{{ toast.detail }}</div>
            }
          </div>
          <button type="button" class="icon-button" (click)="toasts.dismiss(toast.id)" aria-label="Fechar aviso">
            ×
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  protected readonly toasts = inject(ToastService);
}

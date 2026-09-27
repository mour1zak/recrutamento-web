import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ModalComponent } from './modal';

/**
 * Diálogo de confirmação para ações destrutivas/irreversíveis
 * (desistir de candidatura, desativar usuário/empresa, cancelar vaga…).
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `
    <app-modal [title]="title()" [subtitle]="subtitle()" (closed)="cancelled.emit()">
      <p>{{ message() }}</p>
      @if (warning()) {
        <div class="alert alert--warning">
          <span class="alert__icon" aria-hidden="true">!</span>
          <div class="alert__body">{{ warning() }}</div>
        </div>
      }
      <div class="modal__footer">
        <button type="button" class="btn" (click)="cancelled.emit()">Cancelar</button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="tone() === 'danger'"
          [class.btn--primary]="tone() === 'primary'"
          (click)="confirmed.emit()"
          [disabled]="busy()"
        >
          @if (busy()) {
            <span class="spinner" aria-hidden="true"></span>
          }
          {{ confirmLabel() }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ConfirmDialogComponent {
  readonly title = input('Confirmar ação');
  readonly subtitle = input<string | null>(null);
  readonly message = input('Tem certeza?');
  readonly warning = input<string | null>(null);
  readonly confirmLabel = input('Confirmar');
  readonly tone = input<'danger' | 'primary'>('danger');
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}

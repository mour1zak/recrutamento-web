import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Modal genérico (projeção de conteúdo).
 *
 * Sem biblioteca: fecha com `Esc` e clique no fundo, e devolve o foco para o
 * elemento que o abriu — comportamento que a apresentação ao vivo exige
 * (nada de modal que "trava" a tela).
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div
        class="modal"
        [class.modal--wide]="wide()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <div class="modal__header">
          <div>
            <div class="modal__title">{{ title() }}</div>
            @if (subtitle()) {
              <div class="card__hint">{{ subtitle() }}</div>
            }
          </div>
          <button type="button" class="icon-button" (click)="closed.emit()" aria-label="Fechar">×</button>
        </div>
        <ng-content />
      </div>
    </div>
  `,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class ModalComponent implements OnInit, OnDestroy {
  readonly title = input('');
  readonly subtitle = input<string | null>(null);
  readonly wide = input(false);
  readonly closed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previouslyFocused: Element | null = null;

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement;
    // Leva o foco para dentro do diálogo (o primeiro campo ou botão útil).
    const focusable = this.host.nativeElement.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button.btn',
    );
    setTimeout(() => (focusable ?? this.host.nativeElement).focus(), 0);
  }

  ngOnDestroy(): void {
    if (this.previouslyFocused instanceof HTMLElement) {
      this.previouslyFocused.focus();
    }
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}

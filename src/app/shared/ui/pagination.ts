import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Paginação do envelope `{data, page, limit, total}` devolvido por todas as
 * listagens do backend.
 */
@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <div class="pagination">
        <span>
          {{ rangeStart() }}–{{ rangeEnd() }} de {{ total() }}
          @if (label()) {
            <span class="muted">{{ label() }}</span>
          }
        </span>
        <div class="pagination__controls">
          <button
            type="button"
            class="btn btn--sm"
            (click)="goTo(page() - 1)"
            [disabled]="page() <= 1"
            aria-label="Página anterior"
          >
            ← Anterior
          </button>
          <span class="nowrap">Página {{ page() }} de {{ totalPages() }}</span>
          <button
            type="button"
            class="btn btn--sm"
            (click)="goTo(page() + 1)"
            [disabled]="page() >= totalPages()"
            aria-label="Próxima página"
          >
            Próxima →
          </button>
        </div>
      </div>
    }
  `,
})
export class PaginationComponent {
  readonly page = input(1);
  readonly limit = input(20);
  readonly total = input(0);
  readonly label = input<string | null>(null);
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.limit()))));
  protected readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1));
  protected readonly rangeEnd = computed(() => Math.min(this.total(), this.page() * this.limit()));

  protected goTo(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}

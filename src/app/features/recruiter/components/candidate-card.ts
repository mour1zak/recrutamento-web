import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatBytes } from '../../../core/format';

/**
 * Cartão de candidato na visão do recrutador.
 *
 * O backend decide o quanto expõe: enquanto a candidatura está `PENDING`, o
 * payload é reduzido (`id`, `name`, `headline`, `skills`); a partir de
 * `UNDER_REVIEW` vem completo (resumo, telefone, endereço). Este componente
 * mostra exatamente o que chegou — sem preencher lacunas com dado inventado.
 */
@Component({
  selector: 'app-candidate-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="candidate">
      <div class="candidate__head">
        <span class="avatar" aria-hidden="true">{{ initials() }}</span>
        <div style="min-width: 0">
          <div class="strong truncate">{{ name() }}</div>
          @if (headline()) {
            <div class="cell-sub truncate">{{ headline() }}</div>
          }
        </div>
      </div>

      @if (skills().length > 0) {
        <div class="row" style="gap: 6px">
          @for (skill of skills(); track skill) {
            <span class="chip">{{ skill }}</span>
          }
        </div>
      }

      @if (reduced()) {
        <p class="field__hint mb-0">
          Visão de triagem: resumo, telefone e endereço ficam disponíveis assim que a candidatura sair de "Em análise".
        </p>
      } @else {
        <dl class="candidate__facts">
          @if (summary()) {
            <div>
              <dt>Resumo</dt>
              <dd class="preserve-lines">{{ summary() }}</dd>
            </div>
          }
          @if (phone()) {
            <div>
              <dt>Telefone</dt>
              <dd>{{ phone() }}</dd>
            </div>
          }
          @if (address()) {
            <div>
              <dt>Endereço</dt>
              <dd>{{ address() }}</dd>
            </div>
          }
          @if (!summary() && !phone() && !address()) {
            <p class="muted mb-0">O candidato ainda não preencheu estes dados.</p>
          }
        </dl>
      }

      @if (resumeName()) {
        <div class="candidate__resume">
          <span class="section-title mb-0">Currículo</span>
          <span class="cell-sub">{{ resumeName() }} · {{ resumeSize() }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .candidate {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .candidate__head {
        display: flex;
        gap: var(--space-3);
        align-items: center;
      }

      .avatar {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 50%;
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        font-weight: 700;
        font-size: 0.875rem;
      }

      .candidate__facts {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
      }

      .candidate__facts dt {
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-subtle);
        font-weight: 700;
      }

      .candidate__facts dd {
        margin: 0;
        font-size: 0.875rem;
      }

      .candidate__resume {
        border-top: 1px solid var(--color-border);
        padding-top: var(--space-2);
        display: flex;
        flex-direction: column;
      }
    `,
  ],
})
export class CandidateCardComponent {
  readonly name = input.required<string>();
  readonly headline = input<string | null>(null);
  readonly skills = input<string[]>([]);
  readonly summary = input<string | null>(null);
  readonly phone = input<string | null>(null);
  readonly address = input<string | null>(null);
  readonly resumeName = input<string | null>(null);
  readonly resumeBytes = input<number | null>(null);
  /** `true` quando o backend devolveu o payload reduzido (candidatura PENDING). */
  readonly reduced = input(false);

  protected initials(): string {
    const parts = this.name().trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
  }

  protected resumeSize(): string {
    return formatBytes(this.resumeBytes());
  }
}

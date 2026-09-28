import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { take } from 'rxjs';
import { ApiError } from '../../core/api-error';
import { CepService } from '../../core/services/candidate-profile.service';
import { isCepComplete, maskCep } from '../../core/format';
import type { CepLookup } from '../../core/models';

export interface CepFieldState extends CepLookup {
  cep: string;
}

type LookupState = 'idle' | 'loading' | 'resolved' | 'not-found' | 'unavailable';

/**
 * Campo de CEP com autopreenchimento de endereço.
 *
 * Não é uma tela própria (como pede o briefing): é um campo reutilizável dentro
 * dos formulários de empresa (ADMIN) e de perfil do candidato. Ele consulta
 * `GET /cep/:cep` no próprio backend — que é quem fala com o ViaCEP — e mostra
 * o resultado na hora.
 *
 * Tratamento de falha alinhado ao contrato do backend:
 * - `400 cep_nao_encontrado`  → erro de campo ("CEP não encontrado…") e o
 *   formulário fica inválido, porque o backend rejeitaria o salvamento;
 * - `502 servico_cep_indisponivel` (ou API fora do ar) → aviso amarelo
 *   "Não foi possível confirmar o endereço agora — você pode continuar, o
 *   endereço fica em branco", sem bloquear o envio.
 *
 * `street`/`city`/`state` nunca são enviados ao backend em nenhum formulário:
 * quem resolve o endereço é ele, a partir do `cep`.
 */
@Component({
  selector: 'app-cep-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CepFieldComponent),
      multi: true,
    },
  ],
  template: `
    <div class="field">
      <label class="field__label" [for]="inputId()">
        CEP
        @if (required()) {
          <span class="required" aria-hidden="true">*</span>
        }
      </label>
      <div class="input-group">
        <input
          [id]="inputId()"
          class="input"
          [class.input--invalid]="lookupState() === 'not-found'"
          type="text"
          inputmode="numeric"
          autocomplete="postal-code"
          placeholder="00000-000"
          [value]="value()"
          (input)="onInput($event)"
          (blur)="onTouched()"
          [attr.aria-describedby]="hintId()"
          [disabled]="disabled()"
        />
        <button
          type="button"
          class="btn btn--sm"
          (click)="lookup()"
          [disabled]="disabled() || lookupState() === 'loading' || !complete()"
        >
          @if (lookupState() === 'loading') {
            <span class="spinner spinner--dark" aria-hidden="true"></span>
            Consultando
          } @else {
            Buscar endereço
          }
        </button>
      </div>

      @switch (lookupState()) {
        @case ('loading') {
          <span class="field__hint" [id]="hintId()">Consultando o provedor de CEP…</span>
        }
        @case ('resolved') {
          <span class="field__hint" [id]="hintId()">
            ✓ {{ addressSummary() }} — endereço confirmado.
          </span>
        }
        @case ('not-found') {
          <span class="field__error" [id]="hintId()">{{ errorMessage() }}</span>
        }
        @case ('unavailable') {
          <span class="field__warning" [id]="hintId()">{{ errorMessage() }}</span>
        }
        @default {
          <span class="field__hint" [id]="hintId()"> Informe o CEP para preencher o endereço automaticamente. </span>
        }
      }
    </div>
  `,
})
export class CepFieldComponent implements ControlValueAccessor {
  private readonly cepService = inject(CepService);

  /** Valor do campo (CEP formatado). */
  readonly value = model<string>('');
  readonly required = input(false);
  readonly disabled = signal(false);
  readonly inputId = input(`cep-${Math.random().toString(36).slice(2, 8)}`);

  /** Endereço resolvido (exibido/propagado para o formulário pai). */
  readonly address = signal<CepLookup | null>(null);
  readonly addressChange = output<CepFieldState | null>();

  /**
   * `true` quando o backend confirmou que o CEP não existe (`400
   * cep_nao_encontrado`) — o formulário pai usa isso para impedir o envio,
   * já que o backend rejeitaria o salvamento pelo mesmo motivo.
   * Falha de rede/indisponibilidade (502) NÃO bloqueia.
   */
  readonly blockedChange = output<boolean>();

  protected readonly lookupState = signal<LookupState>('idle');
  protected readonly errorMessage = signal('');

  protected readonly hintId = computed(() => `${this.inputId()}-hint`);
  protected readonly complete = computed(() => isCepComplete(this.value()));
  protected readonly addressSummary = computed(() => {
    const resolved = this.address();
    if (!resolved) return '';
    const street = resolved.street ?? 'logradouro não informado';
    const cityState = [resolved.city, resolved.state].filter(Boolean).join(' - ');
    return cityState ? `${street} — ${cityState}` : street;
  });

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const masked = maskCep(target.value);
    target.value = masked;
    this.value.set(masked);
    this.onChange(masked);

    // Estado anterior é invalidado assim que o usuário digita.
    if (this.lookupState() !== 'idle') {
      this.lookupState.set('idle');
      this.address.set(null);
      this.addressChange.emit(null);
      this.blockedChange.emit(false);
    }

    if (isCepComplete(masked)) this.lookup();
  }

  /** Consulta o CEP no backend (`GET /cep/:cep`). */
  lookup(): void {
    const cep = this.value().trim();
    if (!isCepComplete(cep)) return;

    this.lookupState.set('loading');
    this.errorMessage.set('');

    this.cepService
      .lookup(cep)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.address.set(result);
          this.lookupState.set('resolved');
          this.addressChange.emit({ cep, ...result });
          this.blockedChange.emit(false);
        },
        error: (error: ApiError) => {
          this.address.set(null);
          this.addressChange.emit(null);

          if (error.status === 400) {
            // cep_nao_encontrado / cep_formato_invalido → bloqueia o salvamento.
            this.lookupState.set('not-found');
            this.errorMessage.set(error.message);
            this.blockedChange.emit(true);
            return;
          }

          // 502 (provedor indisponível) ou API fora do ar: não bloqueia.
          this.blockedChange.emit(false);
          this.lookupState.set('unavailable');
          this.errorMessage.set(
            error.status === 502 || error.status === 0
              ? 'Não foi possível confirmar o endereço agora — você pode continuar, o endereço fica em branco.'
              : error.message,
          );
        },
      });
  }
}

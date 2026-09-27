import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { AuthCardComponent } from '../auth-card';

/**
 * Cadastro de candidato (`POST /auth/register`).
 *
 * Regras de validação espelhadas no DTO do backend (`RegisterDto`), para dar
 * feedback antes mesmo de bater na API:
 * - `name`: obrigatório, máx. 120;
 * - `email`: formato de email, máx. 180 (o backend normaliza em minúsculas);
 * - `password`: mínimo 8, máx. 256;
 * - confirmação de senha: igual à senha (validação só de cliente).
 *
 * A conta é SEMPRE criada como CANDIDATE — recrutador/admin só existem via
 * gestão de usuários do ADMIN (`PATCH /users/:id/role`).
 *
 * O registro já devolve tokens: o candidato sai daqui logado.
 */
@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, AuthCardComponent],
  template: `
    <app-auth-card
      title="Criar conta de candidato"
      subtitle="Leva menos de um minuto. Você já entra logado e pode se candidatar às vagas abertas."
    >
      <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-alert [message]="errorMessage()" kind="error" [detail]="errorDetail()" />

        <div class="field">
          <label class="field__label" for="name">Nome completo <span class="required">*</span></label>
          <input
            id="name"
            type="text"
            class="input"
            formControlName="name"
            autocomplete="name"
            placeholder="Maria Silva"
            [class.input--invalid]="invalid('name')"
          />
          @if (invalid('name')) {
            <span class="field__error">{{ errorFor('name') }}</span>
          }
        </div>

        <div class="field">
          <label class="field__label" for="email">Email <span class="required">*</span></label>
          <input
            id="email"
            type="email"
            class="input"
            formControlName="email"
            autocomplete="email"
            placeholder="maria.silva@exemplo.com"
            [class.input--invalid]="invalid('email')"
          />
          @if (invalid('email')) {
            <span class="field__error">{{ errorFor('email') }}</span>
          }
        </div>

        <div class="form-row">
          <div class="field">
            <label class="field__label" for="password">Senha <span class="required">*</span></label>
            <input
              id="password"
              type="password"
              class="input"
              formControlName="password"
              autocomplete="new-password"
              placeholder="Mínimo 8 caracteres"
              [class.input--invalid]="invalid('password')"
            />
            @if (invalid('password')) {
              <span class="field__error">{{ errorFor('password') }}</span>
            } @else {
              <span class="field__hint">Mínimo de 8 caracteres.</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="confirmPassword">Confirmar senha <span class="required">*</span></label>
            <input
              id="confirmPassword"
              type="password"
              class="input"
              formControlName="confirmPassword"
              autocomplete="new-password"
              placeholder="Repita a senha"
              [class.input--invalid]="invalid('confirmPassword')"
            />
            @if (invalid('confirmPassword')) {
              <span class="field__error">{{ errorFor('confirmPassword') }}</span>
            }
          </div>
        </div>

        <button type="submit" class="btn btn--primary btn--block" [disabled]="submitting()">
          @if (submitting()) {
            <span class="spinner" aria-hidden="true"></span>
            Criando conta…
          } @else {
            Criar conta e entrar
          }
        </button>

        <p class="field__hint mb-0">
          Ao criar a conta você entra como <strong>candidato</strong>. Perfis de recrutador e administrador são
          atribuídos por um administrador da plataforma.
        </p>
      </form>

      <p class="muted text-center mt-4 mb-0">
        Já tem conta?
        <a routerLink="/auth/login">Entrar</a>
      </p>

      <div authAside>
        <div class="card card--tight">
          <div class="section-title">Depois do cadastro</div>
          <ol class="steps">
            <li>Complete seu perfil (título, resumo, habilidades e CEP).</li>
            <li>Anexe seu currículo em PDF, DOC ou DOCX (até 5 MB).</li>
            <li>Candidate-se às vagas e acompanhe o status de cada uma.</li>
          </ol>
        </div>
      </div>
    </app-auth-card>
  `,
  styles: [
    `
      .steps {
        margin: 0;
        padding-left: 1.1rem;
        color: var(--color-text-muted);
        font-size: 0.8125rem;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
    `,
  ],
})
export class RegisterPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly errorDetail = signal<string | null>(null);

  protected readonly form = this.fb.group(
    {
      name: this.fb.control('', [Validators.required, Validators.maxLength(120)]),
      email: this.fb.control('', [Validators.required, Validators.email, Validators.maxLength(180)]),
      password: this.fb.control('', [Validators.required, Validators.minLength(8), Validators.maxLength(256)]),
      confirmPassword: this.fb.control('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  protected invalid(control: 'name' | 'email' | 'password' | 'confirmPassword'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.dirty || field.touched || this.submitting());
  }

  protected errorFor(control: 'name' | 'email' | 'password' | 'confirmPassword'): string {
    if (control === 'confirmPassword' && this.form.hasError('passwordMismatch')) {
      return 'As senhas não coincidem.';
    }
    const field = this.form.controls[control];
    if (field.hasError('required')) return 'Campo obrigatório.';
    if (field.hasError('email')) return 'Informe um email válido.';
    if (field.hasError('minlength')) {
      return `Mínimo de ${field.getError('minlength').requiredLength} caracteres.`;
    }
    if (field.hasError('maxlength')) return 'Texto longo demais.';
    return 'Valor inválido.';
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.errorMessage.set(null);
    this.errorDetail.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.hasError('passwordMismatch')) {
        this.errorMessage.set('As senhas não coincidem.');
      }
      return;
    }

    const { name, email, password } = this.form.getRawValue();
    this.submitting.set(true);

    this.auth
      .register({ name: name.trim(), email: email.trim(), password })
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          this.submitting.set(false);
          this.toasts.success(`Conta criada, ${user.name.split(' ')[0]}!`, 'Complete seu perfil para se destacar.');
          void this.router.navigate(['/candidate/profile'], { queryParams: { new: '1' } });
        },
        error: (error: ApiError) => {
          this.submitting.set(false);
          if (error.status === 409) {
            this.errorMessage.set('Este email já está cadastrado.');
            this.errorDetail.set('Tente entrar com a senha existente ou use outro email.');
            return;
          }
          if (error.status === 400 && error.fieldErrors?.length) {
            this.errorMessage.set('Confira os dados do formulário.');
            this.errorDetail.set(error.fieldErrors.join(' • '));
            return;
          }
          this.errorMessage.set(error.message);
        },
      });
  }
}

/** Validador de grupo: confirmação precisa ser igual à senha. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirmPassword = group.get('confirmPassword')?.value as string;
  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

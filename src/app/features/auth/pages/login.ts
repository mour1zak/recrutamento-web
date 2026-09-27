import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiError } from '../../../core/api-error';
import { AuthService, homePathForRole } from '../../../core/auth/auth.service';
import { readReturnUrl } from '../../../core/guards/auth.guards';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { AuthCardComponent } from '../auth-card';

/**
 * Login — tela única para os três perfis.
 *
 * O backend devolve o papel do usuário na resposta (`user.role`), então o
 * redirecionamento depois do login é decidido aqui: candidato → vitrine,
 * recrutador → painel, admin → administração.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, AuthCardComponent],
  template: `
    <app-auth-card
      title="Entrar"
      subtitle="Acesse sua conta para se candidatar, gerenciar vagas ou administrar a plataforma."
    >
      @if (sessionExpired()) {
        <div class="mb-4">
          <app-alert kind="warning" message="Sua sessão expirou. Entre novamente para continuar." />
        </div>
      }

      <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-alert [message]="errorMessage()" kind="error" />

        <div class="field">
          <label class="field__label" for="email">Email <span class="required">*</span></label>
          <input
            id="email"
            type="email"
            class="input"
            formControlName="email"
            autocomplete="email"
            placeholder="voce@exemplo.com"
            [class.input--invalid]="invalid('email')"
          />
          @if (invalid('email')) {
            <span class="field__error">{{ errorFor('email') }}</span>
          }
        </div>

        <div class="field">
          <label class="field__label" for="password">Senha <span class="required">*</span></label>
          <input
            id="password"
            type="password"
            class="input"
            formControlName="password"
            autocomplete="current-password"
            placeholder="Sua senha"
            [class.input--invalid]="invalid('password')"
          />
          @if (invalid('password')) {
            <span class="field__error">{{ errorFor('password') }}</span>
          }
        </div>

        <button type="submit" class="btn btn--primary btn--block" [disabled]="submitting()">
          @if (submitting()) {
            <span class="spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            Entrar
          }
        </button>
      </form>

      <p class="muted text-center mt-4 mb-0">
        Ainda não tem conta?
        <a routerLink="/auth/register">Cadastre-se como candidato</a>
      </p>

      <div authAside>
        @if (demoAccounts().length > 0) {
          <div class="card card--tight">
            <div class="section-title">Contas deste ambiente</div>
            <p class="card__hint">
              Usuários criados pelo seed do backend (<code>prisma db seed</code>). Clique para preencher o formulário.
            </p>
            <div class="demo-list">
              @for (account of demoAccounts(); track account.email) {
                <button type="button" class="demo-item" (click)="useAccount(account.email, account.password)">
                  <span class="demo-item__label">{{ account.label }}</span>
                  <span class="demo-item__email">{{ account.email }}</span>
                </button>
              }
            </div>
          </div>
        }

        <div class="card card--tight">
          <div class="section-title">O que cada perfil vê</div>
          <ul class="role-list">
            <li><strong>Candidato</strong> — vitrine de vagas, candidatura, acompanhamento de status e entrevistas.</li>
            <li><strong>Recrutador</strong> — vagas da empresa, candidaturas recebidas, avaliação e indicadores.</li>
            <li><strong>Administrador</strong> — empresas (com CEP), usuários e permissões por papel.</li>
          </ul>
        </div>
      </div>
    </app-auth-card>
  `,
  styles: [
    `
      .demo-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .demo-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: left;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        cursor: pointer;
        font: inherit;
      }

      .demo-item:hover {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
      }

      .demo-item__label {
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .demo-item__email {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .role-list {
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
export class LoginPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly sessionExpired = signal(false);

  protected readonly demoAccounts = computed(() => environment.demoAccounts ?? []);

  protected readonly form = this.fb.group({
    // `email` do backend: @IsEmail + máx. 180 (normalizado em minúsculas lá).
    email: this.fb.control('', [Validators.required, Validators.email, Validators.maxLength(180)]),
    // `password` do login: só @IsString/@MinLength(1) — a força mínima (8) é do registro.
    password: this.fb.control('', [Validators.required, Validators.maxLength(256)]),
  });

  constructor() {
    this.route.queryParamMap.pipe(take(1)).subscribe((params) => {
      this.sessionExpired.set(params.get('expired') === '1');
    });
  }

  protected invalid(control: 'email' | 'password'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.dirty || field.touched || this.submitting());
  }

  protected errorFor(control: 'email' | 'password'): string {
    const field = this.form.controls[control];
    if (field.hasError('required')) return 'Campo obrigatório.';
    if (field.hasError('email')) return 'Informe um email válido.';
    if (field.hasError('maxlength')) return 'Texto longo demais.';
    return 'Valor inválido.';
  }

  protected useAccount(email: string, password: string): void {
    this.form.patchValue({ email, password });
    this.form.markAsUntouched();
    this.errorMessage.set(null);
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);

    this.auth
      .login({ email: email.trim(), password })
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          this.submitting.set(false);
          const returnUrl = readReturnUrl(this.route.snapshot.queryParams as Record<string, unknown>, '');
          const target = returnUrl || homePathForRole(user.role);
          this.toasts.success(`Bem-vindo, ${user.name.split(' ')[0]}!`);
          void this.router.navigateByUrl(target);
        },
        error: (error: ApiError) => {
          this.submitting.set(false);
          this.errorMessage.set(
            error.status === 401
              ? 'Email ou senha inválidos.'
              : error.status === 0
                ? 'Não foi possível conectar à API. Confira se o backend está rodando em http://localhost:3000 e se a x-api-key do front é igual ao API_KEY do .env dele.'
                : error.message,
          );
        },
      });
  }
}

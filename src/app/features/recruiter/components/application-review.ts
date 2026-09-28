import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { PermissionsService, PERMISSIONS } from '../../../core/auth/permissions.service';
import {
  APPLICATION_STATUS_LABEL,
  formatBytes,
  formatDateTime,
  toIsoFromLocalInput,
  toLocalInputValue,
} from '../../../core/format';
import type { Application, ApplicationStatus, Interview } from '../../../core/models';
import { isFullApplication } from '../../../core/models';
import { APPLICATION_STATUS_TRANSITIONS, ApplicationsService } from '../../../core/services/applications.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { DocumentsService } from '../../../core/services/documents.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { ModalComponent } from '../../../shared/ui/modal';
import { InterviewStatusBadgeComponent } from '../../../shared/ui/status-badges';

/**
 * Painel de avaliação do recrutador sobre UMA candidatura.
 *
 * Concentra as ações que o backend permite a quem tem as permission keys de
 * recrutador — e só mostra o que essas keys autorizam:
 * - avançar status (`PATCH /applications/:id/status`), com os destinos vindos da
 *   mesma tabela de transições do backend; `REJECTED` pede motivo;
 * - baixar o currículo anexado (`GET /documents/:id`, blob autenticado);
 * - agendar entrevista (`POST /applications/:id/interviews`) — só habilitado no
 *   estágio `INTERVIEW`, que é a regra do backend (`409
 *   application_not_in_interview_stage` caso contrário);
 * - gerenciar entrevistas existentes (`PATCH /interviews/:id`): concluir,
 *   cancelar, registrar no-show, reagendar (que cria uma NOVA entrevista e
 *   responde `201`) e gravar feedback.
 */
@Component({
  selector: 'app-application-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AlertComponent, ModalComponent, InterviewStatusBadgeComponent],
  template: `
    @if (application(); as application) {
      <div class="stack">
        @if (actionError()) {
          <app-alert [message]="actionError()" kind="error" />
        }

        <!-- Avançar no processo ------------------------------------------- -->
        <section class="card card--tight">
          <div class="card__header">
            <div>
              <div class="card__title">Mover no processo</div>
              <div class="card__hint">
                Status atual:
                <strong>{{ statusLabel(application.status) }}</strong>
                @if (allowed().length === 0) {
                  · estágio final, sem transições possíveis
                }
              </div>
            </div>
          </div>

          @if (allowed().length > 0) {
            <div class="btn-group">
              @for (status of allowed(); track status) {
                <button
                  type="button"
                  class="btn"
                  [class.btn--success]="status === 'HIRED'"
                  [class.btn--outline-danger]="status === 'REJECTED'"
                  [disabled]="busy()"
                  (click)="onPickStatus(application.id, status)"
                >
                  {{ statusLabel(status) }}
                </button>
              }
            </div>
            @if (application.status === 'OFFERED' && fullApplication()) {
              <p class="field__hint mt-4 mb-0">
                Contratar só é aceito enquanto houver posição livre ({{ fullApplication()!.job.filledCount }}/{{
                  fullApplication()!.job.vacancies
                }}
                preenchida(s)).
              </p>
            }
          } @else {
            <p class="muted mb-0">Esta candidatura está encerrada.</p>
          }
        </section>

        <!-- Currículo ------------------------------------------------------ -->
        <section class="card card--tight">
          <div class="card__header">
            <div>
              <div class="card__title">Currículo anexado</div>
              <div class="card__hint">
                O currículo fica disponível enquanto a candidatura estiver em avaliação.
              </div>
            </div>
          </div>

          @if (application.resumeDocument; as resume) {
            <div class="row row--between">
              <div style="min-width: 0">
                <div class="strong truncate">{{ resume.filename }}</div>
                <div class="cell-sub">{{ resume.mimeType }} · {{ size(resume.sizeBytes) }}</div>
              </div>
              <button type="button" class="btn btn--sm" (click)="downloadResume()" [disabled]="downloading()">
                @if (downloading()) {
                  <span class="spinner spinner--dark" aria-hidden="true"></span>
                }
                Baixar currículo
              </button>
            </div>
          } @else {
            <p class="muted mb-0">Esta candidatura não tem currículo anexado.</p>
          }
        </section>

        <!-- Entrevistas ---------------------------------------------------- -->
        <section class="card card--tight">
          <div class="card__header">
            <div>
              <div class="card__title">Entrevistas</div>
              <div class="card__hint">
                @if (application.status === 'INTERVIEW') {
                  Candidatura no estágio de entrevista — é possível agendar.
                } @else {
                  Para agendar, mova a candidatura para o estágio "Entrevista".
                }
              </div>
            </div>
            @if (canCreateInterview() && application.status === 'INTERVIEW') {
              <button type="button" class="btn btn--sm btn--primary" (click)="openSchedule()" [disabled]="busy()">
                Agendar entrevista
              </button>
            }
          </div>

          @if (interviews().length > 0) {
            <div class="list">
              @for (interview of interviews(); track interview.id) {
                <article class="interview">
                  <div class="row row--between">
                    <div>
                      <div class="strong">{{ when(interview.scheduledAt) }}</div>
                      <div class="cell-sub">
                        {{ interview.isRemote ? 'Remota' : 'Presencial' }}
                        @if (interview.durationMinutes) {
                          · {{ interview.durationMinutes }} min
                        }
                        @if (interview.interviewerId) {
                          · entrevistador #{{ interview.interviewerId }}
                        }
                        @if (interview.previousInterviewId) {
                          · reagendada da #{{ interview.previousInterviewId }}
                        }
                      </div>
                    </div>
                    <app-interview-status [status]="interview.status" />
                  </div>

                  @if (interview.feedback) {
                    <div class="feedback">
                      <span class="section-title mb-0">Feedback</span>
                      <p class="preserve-lines mb-0">{{ interview.feedback }}</p>
                    </div>
                  }

                  @if (canUpdateInterview() && !isFinal(interview.status)) {
                    <div class="btn-group">
                      <button type="button" class="btn btn--sm" (click)="setInterviewStatus(interview, 'COMPLETED')">
                        Concluída
                      </button>
                      <button type="button" class="btn btn--sm" (click)="setInterviewStatus(interview, 'NO_SHOW')">
                        Não compareceu
                      </button>
                      <button type="button" class="btn btn--sm" (click)="setInterviewStatus(interview, 'CANCELED')">
                        Cancelar
                      </button>
                      <button type="button" class="btn btn--sm" (click)="openReschedule(interview)">Reagendar</button>
                      <button type="button" class="btn btn--sm" (click)="openFeedback(interview)">Feedback</button>
                    </div>
                  }
                </article>
              }
            </div>
          } @else if (interviewsError()) {
            <app-alert [message]="interviewsError()" kind="warning" />
          } @else {
            <p class="muted mb-0">Nenhuma entrevista agendada para esta candidatura.</p>
          }
        </section>
      </div>

      <!-- Motivo de recusa / contratação ------------------------------------ -->
      @if (statusDialog(); as dialog) {
        <app-modal
          [title]="'Mover para ' + statusLabel(dialog.status)"
          subtitle="O motivo é opcional, mas fica registrado no histórico da candidatura."
          (closed)="statusDialog.set(null)"
        >
          <form class="form" [formGroup]="reasonForm" (ngSubmit)="confirmStatus()" novalidate>
            <div class="field">
              <label class="field__label" for="reason">
                Motivo {{ dialog.status === 'REJECTED' ? 'da recusa' : 'da decisão' }}
              </label>
              <textarea
                id="reason"
                class="textarea"
                formControlName="reason"
                placeholder="Ex.: perfil sem experiência com o stack exigido."
              ></textarea>
              <span class="field__hint">Até 500 caracteres.</span>
            </div>

            @if (dialog.status === 'HIRED') {
              <div class="alert alert--warning">
                <span class="alert__icon" aria-hidden="true">!</span>
                <div class="alert__body">
                  Contratar incrementa o contador de posições preenchidas da vaga. Se não houver posição livre, o
                  backend responde conflito e nada é alterado.
                </div>
              </div>
            }

            @if (actionError()) {
              <app-alert [message]="actionError()" kind="error" />
            }

            <div class="modal__footer">
              <button type="button" class="btn" (click)="statusDialog.set(null)">Cancelar</button>
              <button
                type="submit"
                class="btn"
                [class.btn--danger]="dialog.status === 'REJECTED'"
                [class.btn--success]="dialog.status === 'HIRED'"
                [class.btn--primary]="dialog.status !== 'REJECTED' && dialog.status !== 'HIRED'"
                [disabled]="busy()"
              >
                @if (busy()) {
                  <span class="spinner" aria-hidden="true"></span>
                }
                Confirmar
              </button>
            </div>
          </form>
        </app-modal>
      }

      <!-- Agendar / reagendar entrevista ----------------------------------- -->
      @if (scheduleDialog(); as dialog) {
        <app-modal
          [title]="dialog.mode === 'reschedule' ? 'Reagendar entrevista' : 'Agendar entrevista'"
          [subtitle]="
            dialog.mode === 'reschedule' ? 'Uma nova entrevista é criada e a anterior fica como histórico.' : null
          "
          (closed)="scheduleDialog.set(null)"
        >
          <form class="form" [formGroup]="scheduleForm" (ngSubmit)="confirmSchedule()" novalidate>
            <div class="field">
              <label class="field__label" for="scheduledAt">Data e hora <span class="required">*</span></label>
              <input
                id="scheduledAt"
                class="input"
                type="datetime-local"
                formControlName="scheduledAt"
                [min]="minSchedule()"
              />
              @if (scheduleConflict()) {
                <span class="field__error">{{ scheduleConflict() }}</span>
              }
              <span class="field__hint">Use o seu horário local; a conversão é feita automaticamente.</span>
            </div>

            <div class="field">
              <label class="field__label" for="interviewerId">Id do entrevistador (opcional)</label>
              <input id="interviewerId" class="input" type="number" min="1" step="1" formControlName="interviewerId" />
              <span class="field__hint">
                Opcional: número identificador de quem conduz a entrevista (visível em Administração → Usuários).
              </span>
            </div>

            @if (dialog.mode === 'reschedule') {
              <div class="alert alert--info">
                <span class="alert__icon" aria-hidden="true">i</span>
                <div class="alert__body">
                  Reagendar cria uma nova entrevista e mantém a anterior no histórico.
                </div>
              </div>
            }

            @if (actionError()) {
              <app-alert [message]="actionError()" kind="error" />
            }

            <div class="modal__footer">
              <button type="button" class="btn" (click)="scheduleDialog.set(null)">Cancelar</button>
              <button type="submit" class="btn btn--primary" [disabled]="busy() || scheduleForm.invalid">
                @if (busy()) {
                  <span class="spinner" aria-hidden="true"></span>
                }
                {{ dialog.mode === 'reschedule' ? 'Criar nova data' : 'Agendar' }}
              </button>
            </div>
          </form>
        </app-modal>
      }

      <!-- Feedback da entrevista ------------------------------------------- -->
      @if (feedbackDialog(); as interview) {
        <app-modal
          title="Registrar feedback"
          [subtitle]="when(interview.scheduledAt)"
          (closed)="feedbackDialog.set(null)"
        >
          <form class="form" [formGroup]="feedbackForm" (ngSubmit)="confirmFeedback()" novalidate>
            <div class="field">
              <label class="field__label" for="feedback">Feedback</label>
              <textarea
                id="feedback"
                class="textarea"
                formControlName="feedback"
                placeholder="Avaliação técnica e de perfil, próximos passos…"
                style="min-height: 140px"
              ></textarea>
              <span class="field__hint">Até 2000 caracteres. Fica visível para o candidato.</span>
            </div>

            @if (actionError()) {
              <app-alert [message]="actionError()" kind="error" />
            }

            <div class="modal__footer">
              <button type="button" class="btn" (click)="feedbackDialog.set(null)">Cancelar</button>
              <button type="submit" class="btn btn--primary" [disabled]="busy()">Salvar feedback</button>
            </div>
          </form>
        </app-modal>
      }
    }
  `,
  styles: [
    `
      .interview {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: var(--space-3) var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .feedback {
        background: var(--color-surface-alt);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        font-size: 0.875rem;
      }
    `,
  ],
})
export class ApplicationReviewComponent {
  private readonly applicationsService = inject(ApplicationsService);
  private readonly interviewsService = inject(InterviewsService);
  private readonly documentsService = inject(DocumentsService);
  private readonly permissions = inject(PermissionsService);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Candidatura em avaliação. */
  readonly application = input.required<Application>();
  /** Entrevistas já carregadas pela tela pai (evita requisição duplicada). */
  readonly interviews = input<Interview[]>([]);
  readonly interviewsError = input<string | null>(null);

  /** Emitido depois de qualquer alteração bem-sucedida (a tela pai recarrega). */
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly downloading = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly statusDialog = signal<{ id: number; status: ApplicationStatus } | null>(null);
  protected readonly scheduleDialog = signal<{ mode: 'create' | 'reschedule'; interviewId?: number } | null>(null);
  protected readonly feedbackDialog = signal<Interview | null>(null);

  protected readonly reasonForm = this.fb.group({ reason: this.fb.control('', [Validators.maxLength(500)]) });
  /** `min` do datetime-local: agora (horário local) — entrevista no passado não existe. */
  protected readonly minSchedule = signal(toLocalInputValue(new Date().toISOString()));

  /**
   * Conflito de horário com as entrevistas já existentes desta candidatura.
   *
   * Método (não `computed`): o valor do formulário não é dependência reativa,
   * então um computed cacheava o resultado da abertura do diálogo.
   */
  protected scheduleConflict(): string | null {
    const dialog = this.scheduleDialog();
    if (!dialog) return null;
    const raw = this.scheduleForm.getRawValue().scheduledAt;
    const when = toIsoFromLocalInput(raw ?? '');
    if (!when) return null;

    const start = new Date(when);
    if (dialog.mode === 'create' && start.getTime() < Date.now()) {
      return 'Escolha uma data e hora a partir de agora — não é possível agendar para o passado.';
    }

    const durationMin = 60;
    const startMs = start.getTime();
    const endMs = startMs + durationMin * 60_000;
    for (const interview of this.interviews()) {
      if (interview.status !== 'SCHEDULED') continue;
      if (dialog.mode === 'reschedule' && interview.id === dialog.interviewId) continue;
      const otherStart = new Date(interview.scheduledAt).getTime();
      const otherEnd = otherStart + (interview.durationMinutes ?? durationMin) * 60_000;
      if (startMs < otherEnd && otherStart < endMs) {
        return `Já existe entrevista às ${formatDateTime(interview.scheduledAt)} para esta candidatura. Escolha outro horário.`;
      }
    }
    return null;
  }

  protected readonly scheduleForm = this.fb.group({
    scheduledAt: this.fb.control('', [Validators.required]),
    interviewerId: this.fb.control<number | null>(null, [Validators.min(1)]),
  });
  protected readonly feedbackForm = this.fb.group({ feedback: this.fb.control('', [Validators.maxLength(2000)]) });

  protected readonly fullApplication = computed(() => {
    const application = this.application();
    return isFullApplication(application) ? application : null;
  });

  protected readonly allowed = computed<ApplicationStatus[]>(() => {
    const application = this.application();
    if (!application) return [];
    if (!this.permissions.can(PERMISSIONS.APPLICATION_STATUS_UPDATE)) return [];
    return APPLICATION_STATUS_TRANSITIONS[application.status] ?? [];
  });

  constructor() {
    // Limpa erros de ação quando a candidatura muda (ex.: depois de recarregar).
    effect(() => {
      this.application();
      this.actionError.set(null);
    });
  }

  protected canCreateInterview(): boolean {
    return this.permissions.can(PERMISSIONS.INTERVIEW_CREATE);
  }

  protected canUpdateInterview(): boolean {
    return this.permissions.can(PERMISSIONS.INTERVIEW_UPDATE);
  }

  protected statusLabel(status: ApplicationStatus): string {
    return APPLICATION_STATUS_LABEL[status] ?? status;
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected isFinal(status: Interview['status']): boolean {
    return status === 'COMPLETED' || status === 'CANCELED' || status === 'NO_SHOW';
  }

  // -------------------------------------------------------------------------
  // Status da candidatura
  // -------------------------------------------------------------------------

  protected onPickStatus(id: number, status: ApplicationStatus): void {
    this.actionError.set(null);
    this.reasonForm.reset({ reason: '' });
    this.statusDialog.set({ id, status });
  }

  protected confirmStatus(): void {
    const dialog = this.statusDialog();
    if (!dialog || this.busy()) return;

    this.busy.set(true);
    this.actionError.set(null);
    const reason = this.reasonForm.getRawValue().reason?.trim() || undefined;

    this.applicationsService
      .updateStatus(dialog.id, dialog.status, reason)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.statusDialog.set(null);
          this.toasts.success(`Candidatura movida para "${this.statusLabel(dialog.status)}".`);
          this.changed.emit();
        },
        error: (apiError: ApiError) => {
          this.busy.set(false);
          this.actionError.set(apiError.message);
          if (
            apiError.reason === 'application_status_changed_concurrently' ||
            apiError.reason === 'no_vacancies_left'
          ) {
            this.changed.emit();
          }
        },
      });
  }

  // -------------------------------------------------------------------------
  // Currículo
  // -------------------------------------------------------------------------

  protected downloadResume(): void {
    const resume = this.application()?.resumeDocument;
    if (!resume || this.downloading()) return;

    this.downloading.set(true);
    this.documentsService
      .download(resume.id, resume.filename)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.downloading.set(false);
          this.toasts.success('Download do currículo iniciado.');
        },
        error: (apiError: ApiError) => {
          this.downloading.set(false);
          this.actionError.set(apiError.message);
        },
      });
  }

  // -------------------------------------------------------------------------
  // Entrevistas
  // -------------------------------------------------------------------------

  protected openSchedule(): void {
    this.actionError.set(null);
    this.scheduleForm.reset({ scheduledAt: '', interviewerId: null });
    this.scheduleDialog.set({ mode: 'create' });
  }

  protected openReschedule(interview: Interview): void {
    this.actionError.set(null);
    this.scheduleForm.reset({ scheduledAt: '', interviewerId: interview.interviewerId });
    this.scheduleDialog.set({ mode: 'reschedule', interviewId: interview.id });
  }

  protected confirmSchedule(): void {
    const dialog = this.scheduleDialog();
    if (!dialog || this.busy()) return;

    const value = this.scheduleForm.getRawValue();
    const iso = toIsoFromLocalInput(value.scheduledAt ?? '');
    if (!iso) {
      this.actionError.set('Informe uma data e hora válidas.');
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);

    if (this.scheduleConflict()) {
      this.actionError.set(this.scheduleConflict());
      this.busy.set(false);
      return;
    }

    const request =
      dialog.mode === 'create'
        ? this.interviewsService.create(this.application().id, {
            scheduledAt: iso,
            interviewerId: value.interviewerId,
          })
        : this.interviewsService.update(dialog.interviewId as number, {
            status: 'RESCHEDULED',
            scheduledAt: iso,
          });

    request.pipe(take(1)).subscribe({
      next: (interview) => {
        this.busy.set(false);
        this.scheduleDialog.set(null);
        this.toasts.success(
          dialog.mode === 'create'
            ? `Entrevista agendada para ${this.when(interview.scheduledAt)}.`
            : `Entrevista reagendada para ${this.when(interview.scheduledAt)}.`,
          dialog.mode === 'reschedule' ? 'Uma nova entrevista foi criada (status 201).' : undefined,
        );
        this.changed.emit();
      },
      error: (apiError: ApiError) => {
        this.busy.set(false);
        this.actionError.set(apiError.message);
      },
    });
  }

  protected setInterviewStatus(interview: Interview, status: Interview['status']): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);

    this.interviewsService
      .update(interview.id, { status })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toasts.success('Entrevista atualizada.');
          this.changed.emit();
        },
        error: (apiError: ApiError) => {
          this.busy.set(false);
          this.actionError.set(apiError.message);
        },
      });
  }

  protected openFeedback(interview: Interview): void {
    this.actionError.set(null);
    this.feedbackForm.reset({ feedback: interview.feedback ?? '' });
    this.feedbackDialog.set(interview);
  }

  protected confirmFeedback(): void {
    const interview = this.feedbackDialog();
    if (!interview || this.busy()) return;

    this.busy.set(true);
    this.actionError.set(null);
    const feedback = this.feedbackForm.getRawValue().feedback ?? '';

    this.interviewsService
      .update(interview.id, { feedback })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.feedbackDialog.set(null);
          this.toasts.success('Feedback salvo.');
          this.changed.emit();
        },
        error: (apiError: ApiError) => {
          this.busy.set(false);
          this.actionError.set(apiError.message);
        },
      });
  }
}

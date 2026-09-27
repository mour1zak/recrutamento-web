import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap, take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { PermissionsService, PERMISSIONS } from '../../../core/auth/permissions.service';
import { APPLICATION_STATUS_LABEL, formatBytes, formatDateTime } from '../../../core/format';
import type { Application, ApplicationStatus, Interview } from '../../../core/models';
import { isFullApplication } from '../../../core/models';
import { ApplicationsService } from '../../../core/services/applications.service';
import { CompanyDirectoryService } from '../../../core/services/company-directory.service';
import { DocumentsService } from '../../../core/services/documents.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { ToastService } from '../../../core/toast.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';
import { ModalComponent } from '../../../shared/ui/modal';
import { ApplicationStatusBadgeComponent, InterviewStatusBadgeComponent } from '../../../shared/ui/status-badges';

/** Etapas do funil exibidas ao candidato (REJECTED/WITHDRAWN saem da trilha). */
const FUNNEL: ApplicationStatus[] = ['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'OFFERED', 'HIRED'];
const TERMINAL: ApplicationStatus[] = ['HIRED', 'REJECTED', 'WITHDRAWN'];

/**
 * Detalhe da candidatura — visão do candidato.
 *
 * Mostra o estágio atual, a trilha do processo, a(s) entrevista(s) agendada(s)
 * pelo recrutador (`GET /applications/:id/interviews`, que o candidato lê com
 * `interview:read`? — não: o candidato não tem essa permission key. Por isso a
 * lista de entrevistas é carregada em melhor esforço e a ausência é tratada
 * como "sem entrevista registrada"), o currículo anexado e a desistência
 * (`PATCH /applications/:id/withdraw`).
 */
@Component({
  selector: 'app-candidate-application-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AlertComponent,
    LoadingComponent,
    ModalComponent,
    ApplicationStatusBadgeComponent,
    InterviewStatusBadgeComponent,
  ],
  template: `
    @if (loading()) {
      <app-loading label="Carregando candidatura…" />
    } @else if (error()) {
      <div class="container page">
        <app-alert [message]="error()" kind="error" />
        <p class="mt-4"><a routerLink="/candidate/applications">← Voltar para minhas candidaturas</a></p>
      </div>
    } @else {
      @if (application(); as application) {
        <div class="container page">
          <a class="muted" routerLink="/candidate/applications">← Minhas candidaturas</a>

          <div class="grid grid--sidebar mt-4">
            <div class="stack">
              <article class="card">
                <div class="card__header">
                  <div>
                    <h1>{{ jobTitle() }}</h1>
                    <p class="muted mb-0">{{ companyName() }}</p>
                  </div>
                  <app-application-status [status]="application.status" />
                </div>

                <ol class="track" aria-label="Etapas do processo">
                  @for (step of funnel; track step; let index = $index; let last = $last) {
                    <li
                      class="track__step"
                      [class.track__step--done]="isStepDone(step)"
                      [class.track__step--current]="application.status === step"
                    >
                      <span class="track__dot" aria-hidden="true"></span>
                      <span class="track__label">{{ stepLabel(step) }}</span>
                      @if (!last) {
                        <span class="track__line" aria-hidden="true"></span>
                      }
                    </li>
                  }
                </ol>

                @if (application.status === 'REJECTED') {
                  <div class="alert alert--error mt-4">
                    <span class="alert__icon" aria-hidden="true">✕</span>
                    <div class="alert__body">
                      Sua candidatura foi recusada. Isso não é um demérito: processos costumam ter muitos candidatos por
                      vaga.
                    </div>
                  </div>
                }
                @if (application.status === 'WITHDRAWN') {
                  <div class="alert alert--info mt-4">
                    <span class="alert__icon" aria-hidden="true">i</span>
                    <div class="alert__body">Você desistiu desta candidatura.</div>
                  </div>
                }
                @if (application.status === 'HIRED') {
                  <div class="alert alert--success mt-4">
                    <span class="alert__icon" aria-hidden="true">✓</span>
                    <div class="alert__body">Parabéns! Você foi contratado para esta vaga.</div>
                  </div>
                }

                <hr class="divider" />

                <div class="section-title">Carta de apresentação enviada</div>
                @if (application.coverLetter) {
                  <p class="preserve-lines mb-0">{{ application.coverLetter }}</p>
                } @else {
                  <p class="muted mb-0">Você não enviou carta de apresentação para esta vaga.</p>
                }

                @if (application.resumeDocument) {
                  <hr class="divider" />
                  <div class="section-title">Currículo anexado</div>
                  <div class="row row--between">
                    <div>
                      <div class="strong">{{ application.resumeDocument.filename }}</div>
                      <div class="cell-sub">{{ size(application.resumeDocument.sizeBytes) }}</div>
                    </div>
                    <button type="button" class="btn btn--sm" (click)="downloadResume()" [disabled]="downloading()">
                      @if (downloading()) {
                        <span class="spinner spinner--dark" aria-hidden="true"></span>
                      }
                      Baixar
                    </button>
                  </div>
                }
              </article>

              <article class="card">
                <div class="card__header">
                  <div>
                    <div class="card__title">Entrevistas</div>
                    <div class="card__hint">Agendadas pelo time de recrutamento da empresa.</div>
                  </div>
                </div>

                @if (interviews().length > 0) {
                  <div class="list">
                    @for (interview of interviews(); track interview.id) {
                      <div class="interview">
                        <div class="row row--between">
                          <div>
                            <div class="strong">{{ when(interview.scheduledAt) }}</div>
                            <div class="cell-sub">
                              {{ interview.isRemote ? 'Entrevista remota' : 'Entrevista presencial' }}
                              @if (interview.durationMinutes) {
                                · {{ interview.durationMinutes }} min
                              }
                              @if (interview.previousInterviewId) {
                                · reagendada
                              }
                            </div>
                          </div>
                          <app-interview-status [status]="interview.status" />
                        </div>
                        @if (interview.meetingLink) {
                          <a [href]="interview.meetingLink" target="_blank" rel="noopener">Link da reunião</a>
                        }
                        @if (interview.location) {
                          <div class="cell-sub">Local: {{ interview.location }}</div>
                        }
                        @if (interview.feedback) {
                          <div class="feedback">
                            <span class="section-title mb-0">Feedback recebido</span>
                            <p class="preserve-lines mb-0">{{ interview.feedback }}</p>
                          </div>
                        }
                      </div>
                    }
                  </div>
                } @else if (interviewsError()) {
                  <app-alert [message]="interviewsError()" kind="info" />
                } @else {
                  <p class="muted mb-0">
                    Nenhuma entrevista agendada até agora. Quando o recrutador avançar sua candidatura para a etapa de
                    entrevista e agendar um horário, ela aparece aqui.
                  </p>
                }
              </article>
            </div>

            <aside class="stack">
              <div class="card card--tight">
                <div class="section-title">Resumo</div>
                <dl class="summary">
                  <div>
                    <dt>Candidatura</dt>
                    <dd>#{{ application.id }}</dd>
                  </div>
                  <div>
                    <dt>Enviada em</dt>
                    <dd>{{ when(application.createdAt) }}</dd>
                  </div>
                  <div>
                    <dt>Última atualização</dt>
                    <dd>{{ updatedAt() }}</dd>
                  </div>
                  <div>
                    <dt>Posições na vaga</dt>
                    <dd>{{ vacanciesText() }}</dd>
                  </div>
                </dl>
              </div>

              <div class="card card--tight">
                <div class="section-title">Ações</div>
                <div class="stack" style="gap: 8px">
                  <a class="btn btn--block" [routerLink]="['/jobs', application.jobId]">Ver a vaga</a>
                  <a class="btn btn--block" routerLink="/candidate/profile">Atualizar meu perfil</a>
                  @if (canWithdraw()) {
                    <button type="button" class="btn btn--outline-danger btn--block" (click)="withdrawOpen.set(true)">
                      Desistir da candidatura
                    </button>
                  } @else {
                    <p class="field__hint mb-0">
                      Candidaturas em estágio final ({{ terminalLabel() }}) não podem ser alteradas.
                    </p>
                  }
                </div>
              </div>
            </aside>
          </div>
        </div>

        @if (withdrawOpen()) {
          <app-modal title="Desistir da candidatura" [subtitle]="jobTitle()" (closed)="withdrawOpen.set(false)">
            <form class="form" [formGroup]="withdrawForm" (ngSubmit)="confirmWithdraw()" novalidate>
              <p class="muted">
                Sua candidatura passará para o status <strong>Desistência</strong>. Essa ação não pode ser desfeita.
              </p>
              <div class="field">
                <label class="field__label" for="reason">Motivo (opcional)</label>
                <textarea
                  id="reason"
                  class="textarea"
                  formControlName="reason"
                  placeholder="Ex.: aceitei outra proposta."
                ></textarea>
                <span class="field__hint">Até 500 caracteres — ajuda a empresa a entender sua decisão.</span>
              </div>
              @if (actionError()) {
                <app-alert [message]="actionError()" kind="error" />
              }
              <div class="modal__footer">
                <button type="button" class="btn" (click)="withdrawOpen.set(false)">Cancelar</button>
                <button type="submit" class="btn btn--danger" [disabled]="acting()">
                  @if (acting()) {
                    <span class="spinner" aria-hidden="true"></span>
                  }
                  Confirmar desistência
                </button>
              </div>
            </form>
          </app-modal>
        }
      }
    }
  `,
  styles: [
    `
      .track {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        list-style: none;
        margin: var(--space-4) 0 0;
        padding: 0;
      }

      .track__step {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px 6px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        color: var(--color-text-subtle);
        font-size: 0.8125rem;
        background: var(--color-surface);
      }

      .track__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-border-strong);
      }

      .track__step--done {
        color: var(--color-text-muted);
      }

      .track__step--done .track__dot {
        background: var(--color-success);
      }

      .track__step--current {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        font-weight: 650;
      }

      .track__step--current .track__dot {
        background: var(--color-primary);
      }

      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
      }

      .summary dt {
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-subtle);
        font-weight: 700;
      }

      .summary dd {
        margin: 0;
        font-weight: 550;
      }

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
export class CandidateApplicationPageComponent {
  private readonly applications = inject(ApplicationsService);
  private readonly interviewsService = inject(InterviewsService);
  private readonly documents = inject(DocumentsService);
  private readonly companies = inject(CompanyDirectoryService);
  private readonly permissions = inject(PermissionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly funnel = FUNNEL;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly application = signal<Application | null>(null);
  protected readonly interviews = signal<Interview[]>([]);
  protected readonly interviewsError = signal<string | null>(null);

  protected readonly withdrawOpen = signal(false);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly downloading = signal(false);

  protected readonly withdrawForm = this.fb.group({ reason: this.fb.control('') });

  protected readonly jobTitle = computed(() => {
    const application = this.application();
    if (!application) return '';
    return isFullApplication(application) ? application.job.title : `Vaga #${application.jobId}`;
  });

  protected readonly companyName = computed(() => {
    const application = this.application();
    if (!application || !isFullApplication(application)) return '—';
    return this.companies.name(application.job.companyId) || `Empresa #${application.job.companyId}`;
  });

  protected readonly updatedAt = computed(() => {
    const application = this.application();
    return application && isFullApplication(application) ? formatDateTime(application.updatedAt) : '—';
  });

  protected readonly vacanciesText = computed(() => {
    const application = this.application();
    if (!application || !isFullApplication(application)) return '—';
    return `${application.job.filledCount} de ${application.job.vacancies} preenchida(s)`;
  });

  protected readonly canWithdraw = computed(() => {
    const application = this.application();
    if (!application) return false;
    return this.permissions.can(PERMISSIONS.APPLICATION_WITHDRAW_OWN) && !TERMINAL.includes(application.status);
  });

  constructor() {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(),
        switchMap((params) => {
          const id = Number(params.get('id'));
          this.loading.set(true);
          this.error.set(null);
          return this.applications.get(id);
        }),
      )
      .subscribe({
        next: (application) => {
          this.application.set(application);
          this.loading.set(false);
          if (isFullApplication(application)) {
            this.companies.load([application.job.companyId]).subscribe();
          }
          this.loadInterviews(application.id);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(
            apiError.status === 404
              ? 'Candidatura não encontrada.'
              : apiError.status === 403
                ? 'Você não tem permissão para ver esta candidatura.'
                : apiError.message,
          );
        },
      });
  }

  /**
   * Melhor esforço: o candidato não tem a permission key `interview:read` no
   * seed padrão, então a rota pode responder 403. Nesse caso mostramos a
   * informação de estágio (que já vem no status da candidatura) em vez de
   * tratar como erro fatal.
   */
  private loadInterviews(applicationId: number): void {
    this.interviews.set([]);
    this.interviewsError.set(null);
    this.interviewsService
      .listForApplication(applicationId)
      .pipe(
        take(1),
        catchError(() => of(null)),
      )
      .subscribe((result) => {
        if (result === null) {
          this.interviewsError.set(
            'Quando houver entrevista agendada, o status desta candidatura muda para "Entrevista" e os detalhes ficam disponíveis aqui.',
          );
          return;
        }
        this.interviews.set(result);
      });
  }

  protected stepLabel(status: ApplicationStatus): string {
    return APPLICATION_STATUS_LABEL[status];
  }

  protected isStepDone(step: ApplicationStatus): boolean {
    const current = this.application()?.status;
    if (!current) return false;
    return FUNNEL.indexOf(step) < FUNNEL.indexOf(current);
  }

  protected terminalLabel(): string {
    return 'contratado, recusado ou desistência';
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected downloadResume(): void {
    const application = this.application();
    if (!application?.resumeDocument || this.downloading()) return;
    this.downloading.set(true);
    this.documents
      .download(application.resumeDocument.id, application.resumeDocument.filename)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.downloading.set(false);
          this.toasts.success('Download iniciado.');
        },
        error: (apiError: ApiError) => {
          this.downloading.set(false);
          this.toasts.error(apiError.message);
        },
      });
  }

  protected confirmWithdraw(): void {
    const application = this.application();
    if (!application || this.acting()) return;

    this.acting.set(true);
    this.actionError.set(null);
    const reason = this.withdrawForm.getRawValue().reason?.trim() || undefined;

    this.applications
      .withdraw(application.id, reason)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.withdrawOpen.set(false);
          this.application.set(updated);
          this.toasts.success('Candidatura encerrada.', 'Você desistiu deste processo seletivo.');
        },
        error: (apiError: ApiError) => {
          this.acting.set(false);
          this.actionError.set(apiError.message);
        },
      });
  }
}

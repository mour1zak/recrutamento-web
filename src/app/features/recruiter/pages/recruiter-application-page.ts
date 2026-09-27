import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap, take } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { APPLICATION_STATUS_LABEL, formatDate, formatDateTime } from '../../../core/format';
import type { Application, CandidateProfile, Interview, JobStatus } from '../../../core/models';
import { isFullApplication, isFullProfile } from '../../../core/models';
import { ApplicationsService } from '../../../core/services/applications.service';
import { CandidateProfileService } from '../../../core/services/candidate-profile.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { AlertComponent } from '../../../shared/ui/alert';
import { LoadingComponent } from '../../../shared/ui/loading';
import { ApplicationStatusBadgeComponent } from '../../../shared/ui/status-badges';
import { ApplicationReviewComponent } from '../components/application-review';
import { CandidateCardComponent } from '../components/candidate-card';

/**
 * Candidatura em tela cheia (visão do recrutador/admin).
 *
 * Mesma composição da página de candidaturas da vaga, mas com URL própria —
 * útil para links diretos (ex.: "Avaliar" no painel) e para a apresentação.
 */
@Component({
  selector: 'app-recruiter-application-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AlertComponent,
    LoadingComponent,
    ApplicationStatusBadgeComponent,
    ApplicationReviewComponent,
    CandidateCardComponent,
  ],
  template: `
    <div class="container page">
      <a class="muted" [routerLink]="backLink()">← {{ backLabel() }}</a>

      @if (loading()) {
        <app-loading label="Carregando candidatura…" />
      } @else if (loadError()) {
        <div class="mt-4"><app-alert [message]="loadError()" kind="error" /></div>
      } @else {
        @if (application(); as application) {
          <div class="page-header">
            <div class="page-header__titles">
              <h1>{{ application.candidate.name }}</h1>
              <p class="page-header__subtitle mb-0">
                Candidatura #{{ application.id }} · {{ jobTitle() }} · recebida em {{ date(application.createdAt) }}
              </p>
            </div>
            <div class="page-header__actions">
              <app-application-status [status]="application.status" />
            </div>
          </div>

          <div class="grid grid--sidebar">
            <div class="stack">
              <section class="card">
                <div class="card__header">
                  <div>
                    <div class="card__title">Perfil do candidato</div>
                    <div class="card__hint">
                      O nível de detalhe é decidido pelo backend conforme o estágio da candidatura.
                    </div>
                  </div>
                </div>

                <app-candidate-card
                  [name]="application.candidate.name"
                  [headline]="headline()"
                  [skills]="skills()"
                  [summary]="summary()"
                  [phone]="phone()"
                  [address]="address()"
                  [resumeName]="application.resumeDocument?.filename ?? null"
                  [resumeBytes]="application.resumeDocument?.sizeBytes ?? null"
                  [reduced]="!profileIsFull()"
                />

                @if (profileNote()) {
                  <p class="field__hint mt-4 mb-0">{{ profileNote() }}</p>
                }
              </section>

              <section class="card">
                <div class="card__header">
                  <div class="card__title">Carta de apresentação</div>
                </div>
                @if (application.coverLetter) {
                  <p class="preserve-lines mb-0">{{ application.coverLetter }}</p>
                } @else {
                  <p class="muted mb-0">O candidato não enviou carta de apresentação.</p>
                }
              </section>
            </div>

            <aside>
              <app-application-review
                [application]="application"
                [interviews]="interviews()"
                [interviewsError]="interviewsError()"
                (changed)="reload()"
              />
            </aside>
          </div>
        }
      }
    </div>
  `,
})
export class RecruiterApplicationPageComponent {
  private readonly applicationsService = inject(ApplicationsService);
  private readonly profileService = inject(CandidateProfileService);
  private readonly interviewsService = inject(InterviewsService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly application = signal<Application | null>(null);
  protected readonly profile = signal<CandidateProfile | null>(null);
  protected readonly profileNote = signal<string | null>(null);
  protected readonly interviews = signal<Interview[]>([]);
  protected readonly interviewsError = signal<string | null>(null);

  private applicationId = 0;

  protected readonly backLink = computed(() => {
    const application = this.application();
    return application && isFullApplication(application) ? `/recruiter/jobs/${application.job.id}` : '/recruiter/jobs';
  });

  protected readonly backLabel = computed(() =>
    this.application() && isFullApplication(this.application()!) ? 'Candidaturas da vaga' : 'Minhas vagas',
  );

  protected readonly jobTitle = computed(() => {
    const application = this.application();
    if (!application) return '';
    return isFullApplication(application) ? application.job.title : `Vaga #${application.jobId}`;
  });

  protected readonly profileIsFull = computed(() => {
    const profile = this.profile();
    return profile ? isFullProfile(profile) : false;
  });

  protected readonly headline = computed(() => {
    const profile = this.profile();
    if (profile) return profile.headline;
    const application = this.application();
    return application && !isFullApplication(application) ? application.candidate.headline : null;
  });

  protected readonly skills = computed(() => {
    const profile = this.profile();
    if (profile) return profile.skills;
    const application = this.application();
    return application && !isFullApplication(application) ? application.candidate.skills : [];
  });

  protected readonly summary = computed(() => {
    const profile = this.profile();
    return profile && isFullProfile(profile) ? profile.summary : null;
  });

  protected readonly phone = computed(() => {
    const profile = this.profile();
    return profile && isFullProfile(profile) ? profile.phone : null;
  });

  protected readonly address = computed(() => {
    const profile = this.profile();
    if (!profile || !isFullProfile(profile)) return null;
    const parts = [profile.street, profile.city, profile.state, profile.cep].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : null;
  });

  constructor() {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(),
        switchMap((params) => {
          this.applicationId = Number(params.get('id'));
          this.loading.set(true);
          this.loadError.set(null);
          return this.applicationsService.get(this.applicationId);
        }),
      )
      .subscribe({
        next: (application) => {
          this.application.set(application);
          this.loading.set(false);
          this.loadProfile(application.candidate.id, application.status);
          this.loadInterviews(this.applicationId);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.loadError.set(
            apiError.status === 404
              ? 'Candidatura não encontrada (ou fora do escopo da sua empresa).'
              : apiError.status === 403
                ? 'Você não tem permissão para ver esta candidatura.'
                : apiError.message,
          );
        },
      });
  }

  protected reload(): void {
    this.applicationsService
      .get(this.applicationId)
      .pipe(
        take(1),
        catchError(() => of<Application | null>(null)),
      )
      .subscribe((application) => {
        if (application) {
          this.application.set(application);
          this.loadProfile(application.candidate.id, application.status);
        }
        this.loadInterviews(this.applicationId);
      });
  }

  private loadProfile(candidateId: number, status: Application['status']): void {
    this.profileService
      .getByUserId(candidateId)
      .pipe(
        take(1),
        catchError(() => of<CandidateProfile | null>(null)),
      )
      .subscribe((profile) => {
        this.profile.set(profile);
        if (!profile) {
          this.profileNote.set('O candidato ainda não criou o perfil público.');
          return;
        }
        if (!isFullProfile(profile)) {
          this.profileNote.set(
            status === 'PENDING'
              ? 'Visão de triagem: enquanto a candidatura estiver em "Em análise", o backend libera só nome, título e habilidades.'
              : 'O backend devolveu o perfil resumido para esta candidatura.',
          );
        } else {
          this.profileNote.set(null);
        }
      });
  }

  private loadInterviews(applicationId: number): void {
    this.interviewsService
      .listForApplication(applicationId)
      .pipe(
        take(1),
        catchError(() => of<Interview[] | null>(null)),
      )
      .subscribe((result) => {
        if (result === null) {
          this.interviewsError.set('Não foi possível carregar as entrevistas desta candidatura.');
          return;
        }
        this.interviews.set(result);
        this.interviewsError.set(null);
      });
  }

  protected date(iso: string): string {
    return formatDateTime(iso);
  }

  protected statusLabel(status: JobStatus | Application['status']): string {
    return APPLICATION_STATUS_LABEL[status as keyof typeof APPLICATION_STATUS_LABEL] ?? String(status);
  }

  protected published(iso: string): string {
    return formatDate(iso);
  }
}

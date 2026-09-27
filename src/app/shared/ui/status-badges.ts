import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BadgeTone } from '../../core/format';
import { BadgeComponent } from './badge';
import type { ApplicationStatus, InterviewStatus, JobStatus } from '../../core/models';
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_TONE,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
} from '../../core/format';

/** Badge de status de vaga. */
@Component({
  selector: 'app-job-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `<app-badge [tone]="tone(status())" [label]="text(status())" />`,
})
export class JobStatusBadgeComponent {
  readonly status = input.required<JobStatus>();
  protected readonly tone = (status: JobStatus): BadgeTone => JOB_STATUS_TONE[status] ?? 'neutral';
  protected readonly text = (status: JobStatus): string => JOB_STATUS_LABEL[status] ?? status;
}

/** Badge de status de candidatura (o "Em análise / Entrevista / Contratado / Recusado" do briefing). */
@Component({
  selector: 'app-application-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `<app-badge [tone]="tone(status())" [label]="text(status())" />`,
})
export class ApplicationStatusBadgeComponent {
  readonly status = input.required<ApplicationStatus>();
  protected readonly tone = (status: ApplicationStatus): BadgeTone => APPLICATION_STATUS_TONE[status] ?? 'neutral';
  protected readonly text = (status: ApplicationStatus): string => APPLICATION_STATUS_LABEL[status] ?? status;
}

/** Badge de status de entrevista. */
@Component({
  selector: 'app-interview-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `<app-badge [tone]="tone(status())" [label]="text(status())" />`,
})
export class InterviewStatusBadgeComponent {
  readonly status = input.required<InterviewStatus>();
  protected readonly tone = (status: InterviewStatus): BadgeTone => INTERVIEW_STATUS_TONE[status] ?? 'neutral';
  protected readonly text = (status: InterviewStatus): string => INTERVIEW_STATUS_LABEL[status] ?? status;
}

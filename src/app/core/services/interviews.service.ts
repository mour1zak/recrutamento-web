import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { Interview, InterviewStatus } from '../models';

export interface CreateInterviewInput {
  /** ISO 8601 (`datetime-local` do formulário é convertido antes). */
  scheduledAt: string;
  interviewerId?: number | null;
}

export interface UpdateInterviewInput {
  status?: InterviewStatus;
  feedback?: string;
  /** Obrigatório junto de `status: 'RESCHEDULED'` — vira o `scheduledAt` da NOVA entrevista. */
  scheduledAt?: string;
}

/** Status terminais de entrevista (o backend rejeita atualizar com `409`). */
export const FINAL_INTERVIEW_STATUSES: InterviewStatus[] = ['COMPLETED', 'CANCELED', 'NO_SHOW'];

/**
 * Entrevistas — sempre no escopo de uma candidatura.
 *
 * Contrato importante: `PATCH /interviews/:id` devolve `200` com a entrevista
 * editada, mas `201` com uma NOVA entrevista quando o corpo pede
 * `status: 'RESCHEDULED'` (a original vira histórico). O cliente trata as duas
 * respostas da mesma forma (o corpo é sempre um `Interview`), e a lista é
 * recarregada depois.
 */
@Injectable({ providedIn: 'root' })
export class InterviewsService {
  private readonly api = inject(ApiClient);

  create(applicationId: number, input: CreateInterviewInput): Observable<Interview> {
    const body: Record<string, unknown> = { scheduledAt: input.scheduledAt };
    if (input.interviewerId !== undefined && input.interviewerId !== null) {
      body['interviewerId'] = input.interviewerId;
    }
    return this.api.post<Interview>(`applications/${applicationId}/interviews`, body);
  }

  listForApplication(applicationId: number): Observable<Interview[]> {
    return this.api.get<Interview[]>(`applications/${applicationId}/interviews`);
  }

  get(id: number): Observable<Interview> {
    return this.api.get<Interview>(`interviews/${id}`);
  }

  update(id: number, input: UpdateInterviewInput): Observable<Interview> {
    const body: Record<string, unknown> = {};
    if (input.status !== undefined) body['status'] = input.status;
    if (input.feedback !== undefined && input.feedback !== null) body['feedback'] = input.feedback;
    if (input.scheduledAt !== undefined && input.scheduledAt !== null) body['scheduledAt'] = input.scheduledAt;
    return this.api.patch<Interview>(`interviews/${id}`, body);
  }
}

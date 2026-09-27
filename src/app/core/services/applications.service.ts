import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { Application, ApplicationStatus, ListQuery, Paginated } from '../models';

export interface ApplicationsQuery extends ListQuery {
  status?: ApplicationStatus;
}

export interface CreateApplicationInput {
  coverLetter?: string;
  /** Id de um `Document` (currículo) já enviado pelo próprio candidato. */
  resumeDocumentId?: number | null;
}

/**
 * Transições válidas de status de candidatura — espelho da tabela do backend
 * (`applications.service.ts`). A UI mostra só os botões que o backend aceita,
 * então `400 invalid_status_transition` não ocorre por uso normal.
 *
 * `HIRED`, `REJECTED` e `WITHDRAWN` são terminais. `HIRED` ainda passa pela
 * checagem atômica de capacidade da vaga (`409 no_vacancies_left`).
 */
export const APPLICATION_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  PENDING: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFERED', 'REJECTED'],
  OFFERED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

/** Status em que o recrutador já pode agendar entrevista (`interview:create`). */
export const INTERVIEW_STAGE: ApplicationStatus = 'INTERVIEW';

/**
 * Candidaturas: criar (candidato), listar as minhas, listar por vaga
 * (recrutador), avançar status e desistir.
 *
 * As respostas vêm em duas formas — completa (`ApplicationFull`) ou reduzida
 * (`ApplicationReduced`, quando o recrutador lê uma candidatura ainda
 * `PENDING`). Os componentes usam `isFullApplication()` para decidir o que
 * mostrar, em vez de assumir campos que podem não existir.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly api = inject(ApiClient);

  create(jobId: number, input: CreateApplicationInput = {}): Observable<Application> {
    const body: Record<string, unknown> = {};
    if (input.coverLetter !== undefined && input.coverLetter !== null && input.coverLetter.trim() !== '') {
      body['coverLetter'] = input.coverLetter;
    }
    if (input.resumeDocumentId !== undefined && input.resumeDocumentId !== null) {
      body['resumeDocumentId'] = input.resumeDocumentId;
    }
    return this.api.post<Application>(`jobs/${jobId}/applications`, body);
  }

  listMine(query: ApplicationsQuery = {}): Observable<Paginated<Application>> {
    return this.api.get<Paginated<Application>>('applications/me', {
      page: query.page,
      limit: query.limit,
      status: query.status,
      sortOrder: query.sortOrder,
    });
  }

  listForJob(jobId: number, query: ApplicationsQuery = {}): Observable<Paginated<Application>> {
    return this.api.get<Paginated<Application>>(`jobs/${jobId}/applications`, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      sortOrder: query.sortOrder,
    });
  }

  get(id: number): Observable<Application> {
    return this.api.get<Application>(`applications/${id}`);
  }

  updateStatus(id: number, status: ApplicationStatus, reason?: string): Observable<Application> {
    const body: Record<string, unknown> = { status };
    if (reason !== undefined && reason !== null && reason.trim() !== '') body['reason'] = reason;
    return this.api.patch<Application>(`applications/${id}/status`, body);
  }

  withdraw(id: number, reason?: string): Observable<Application> {
    const body: Record<string, unknown> = {};
    if (reason !== undefined && reason !== null && reason.trim() !== '') body['reason'] = reason;
    return this.api.patch<Application>(`applications/${id}/withdraw`, body);
  }

  allowedTransitions(status: ApplicationStatus): ApplicationStatus[] {
    return APPLICATION_STATUS_TRANSITIONS[status] ?? [];
  }
}

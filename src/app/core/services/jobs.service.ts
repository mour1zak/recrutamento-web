import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ApiClient } from '../http/api-client';
import type { JobStatus, ListQuery, Paginated, PublicJob, ScopedJob } from '../models';

export interface PublicJobsQuery extends ListQuery {
  /** Busca textual livre no título/descrição (parâmetro `search` do backend). */
  search?: string;
}

export interface MyJobsQuery extends ListQuery {
  status?: JobStatus;
}

export interface CreateJobInput {
  title: string;
  description: string;
  vacancies: number;
  isRemote: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  /** Obrigatório quando quem cria é ADMIN (que não tem empresa própria). */
  companyId?: number | null;
}

export type UpdateJobInput = Partial<Omit<CreateJobInput, 'companyId'>>;

/**
 * Transições válidas de status de vaga — espelho exato da tabela do backend
 * (`jobs.service.ts` / README §5). A UI só oferece botões que o backend
 * aceitaria, então `400 invalid_status_transition` não acontece por clique.
 *
 * `CLOSED` e `CANCELED` são terminais. Não existe `DELETE /jobs/:id`:
 * o soft-delete oficial é `CANCELED`.
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['OPEN', 'CANCELED'],
  OPEN: ['PAUSED', 'FILLED', 'CLOSED', 'CANCELED'],
  PAUSED: ['OPEN', 'CANCELED'],
  FILLED: ['CLOSED'],
  CLOSED: [],
  CANCELED: [],
};

/**
 * Vagas: vitrine pública, detalhe, "minhas vagas" (recrutador/admin) e ciclo
 * de vida (criar/editar/mudar status).
 *
 * Nota de contrato importante para o detalhe público: `GET /jobs/:id` exige
 * JWT + `job:read` — visitante anônimo NÃO consegue ler uma vaga por id. A
 * única rota pública é `GET /jobs` (lista só vagas `OPEN`). Por isso a tela de
 * detalhe tenta a rota autenticada quando há sessão e, sem sessão (ou 404),
 * resolve a vaga pela vitrine pública.
 */
@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);

  listPublicJobs(query: PublicJobsQuery = {}): Observable<Paginated<PublicJob>> {
    return this.api.get<Paginated<PublicJob>>('jobs', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      sortOrder: query.sortOrder,
    });
  }

  getJob(id: number): Observable<ScopedJob> {
    return this.api.get<ScopedJob>(`jobs/${id}`);
  }

  listMyJobs(query: MyJobsQuery = {}): Observable<Paginated<ScopedJob>> {
    return this.api
      .get<Paginated<ScopedJob>>('jobs/mine', {
        page: query.page,
        limit: query.limit,
        status: query.status,
        sortOrder: query.sortOrder,
      })
      .pipe(
        map((page) => {
          // O login devolve só {id, name, email, role}: o id da empresa do
          // recrutador é descoberto aqui e fica em cache na sessão.
          this.auth.adoptCompanyId(page.data[0]?.companyId ?? null);
          return page;
        }),
      );
  }

  createJob(input: CreateJobInput): Observable<ScopedJob> {
    // O backend usa `forbidNonWhitelisted` + validação estrita: campos
    // opcionais não preenchidos NÃO são enviados (nem como `null`).
    const body: Record<string, unknown> = {
      title: input.title,
      description: input.description,
      vacancies: input.vacancies,
      isRemote: input.isRemote,
    };
    if (input.salaryMin !== undefined && input.salaryMin !== null) body['salaryMin'] = input.salaryMin;
    if (input.salaryMax !== undefined && input.salaryMax !== null) body['salaryMax'] = input.salaryMax;
    if (input.companyId !== undefined && input.companyId !== null) body['companyId'] = input.companyId;
    return this.api.post<ScopedJob>('jobs', body);
  }

  updateJob(id: number, input: UpdateJobInput): Observable<ScopedJob> {
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body['title'] = input.title;
    if (input.description !== undefined) body['description'] = input.description;
    if (input.vacancies !== undefined) body['vacancies'] = input.vacancies;
    if (input.isRemote !== undefined) body['isRemote'] = input.isRemote;
    if (input.salaryMin !== undefined) body['salaryMin'] = input.salaryMin;
    if (input.salaryMax !== undefined) body['salaryMax'] = input.salaryMax;
    return this.api.patch<ScopedJob>(`jobs/${id}`, body);
  }

  updateJobStatus(id: number, status: JobStatus): Observable<ScopedJob> {
    return this.api.patch<ScopedJob>(`jobs/${id}/status`, { status });
  }

  /** Próximos status possíveis a partir do atual (para montar os botões). */
  allowedTransitions(status: JobStatus): JobStatus[] {
    return JOB_STATUS_TRANSITIONS[status] ?? [];
  }
}

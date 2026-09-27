import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { Company, Paginated, PublicJob, UserSummary } from '../models';

/**
 * Cache de nomes de empresa.
 *
 * Motivo: várias rotas devolvem só `companyId` (ex.: `job` dentro de uma
 * candidatura) e o backend não tem listagem pública de empresas — apenas
 * `GET /companies/:id` (JWT + `company:read`). Este serviço resolve cada id uma
 * única vez por sessão para a UI conseguir mostrar "Empresa X" em vez de um
 * número cru. Falha vira string vazia (a tela mostra "—" sem quebrar).
 */
@Injectable({ providedIn: 'root' })
export class CompanyDirectoryService {
  private readonly api = inject(ApiClient);
  private readonly cache = signal<Record<number, string>>({});

  /**
   * Empresas criadas NESTA sessão.
   *
   * Motivo: a descoberta por id só enxerga empresas que já têm vagas ou
   * usuários vinculados — uma empresa recém-criada ainda não tem nenhum dos
   * dois, então ela sumiria dos seletores ("criei e não aparece no filtro da
   * vaga"). O registro em sessão fecha esse buraco até o backend expor uma
   * listagem própria.
   */
  private readonly registered = signal<Company[]>([]);

  readonly names = this.cache.asReadonly();

  name(id: number | null | undefined): string {
    if (!id) return '';
    return this.cache()[id] ?? '';
  }

  /** Garante que os ids informados estejam no cache e devolve o mapa. */
  load(ids: Array<number | null | undefined>): Observable<Record<number, string>> {
    const unique = [...new Set(ids.filter((id): id is number => !!id && this.cache()[id] === undefined))];
    if (unique.length === 0) return of(this.cache());

    const requests = unique.map((id) =>
      this.api.get<Company>(`companies/${id}`).pipe(
        map((company) => company.name),
        // Empresa fora do escopo (404 anti-enumeração) ou inativa: nome vazio,
        // sem derrubar a tela inteira.
        catchError(() => of('')),
      ),
    );

    return forkJoin(requests).pipe(
      map((names) => {
        const next = { ...this.cache() };
        unique.forEach((id, index) => {
          next[id] = names[index] ?? '';
        });
        this.cache.set(next);
        return next;
      }),
    );
  }

  /**
   * Descobre as empresas cadastradas.
   *
   * O backend não tem `GET /companies` (apenas `GET /companies/:id`), então a
   * lista é montada a partir dos ids que aparecem em rotas que o ADMIN lê:
   * `GET /jobs/mine` (ADMIN vê as vagas de todas as empresas) e `GET /users`
   * (`companyId` dos recrutadores). Limitação honesta: uma empresa sem vagas e
   * sem recrutadores vinculados não aparece aqui — mas ela também não tem nada
   * para gerenciar, e o ADMIN pode consultá-la pelo id em `/admin/companies/:id/edit`.
   */
  /** Registra uma empresa criada/agora conhecida (idempotente por id). */
  register(company: Company): void {
    this.registered.update((current) => {
      const others = current.filter((item) => item.id !== company.id);
      return [company, ...others];
    });
    this.cache.update((current) => ({ ...current, [company.id]: company.name }));
  }

  discoverCompanies(): Observable<Company[]> {
    return forkJoin({
      jobs: this.api
        .get<Paginated<PublicJob & { companyId?: number }>>('jobs/mine', { page: 1, limit: 100 })
        .pipe(catchError(() => of({ data: [] as PublicJob[] }))),
      users: this.api
        .get<Paginated<UserSummary>>('users', { page: 1, limit: 100 })
        .pipe(catchError(() => of({ data: [] as UserSummary[] }))),
    }).pipe(
      map(({ jobs, users }) => {
        const ids = new Set<number>();
        jobs.data.forEach((job) => {
          const companyId = (job as { companyId?: number }).companyId ?? job.company?.id;
          if (companyId) ids.add(companyId);
        });
        users.data.forEach((user) => {
          if (user.companyId) ids.add(user.companyId);
        });
        return [...ids].sort((a, b) => a - b);
      }),
      switchMap((ids) =>
        ids.length === 0
          ? of([] as Company[])
          : forkJoin(ids.map((id) => this.api.get<Company>(`companies/${id}`).pipe(catchError(() => of(null))))).pipe(
              map((companies) => companies.filter((company): company is Company => company !== null)),
            ),
      ),
      tap((companies) => {
        // Aproveita para aquecer o cache de nomes.
        const next = { ...this.cache() };
        companies.forEach((company) => {
          next[company.id] = company.name;
        });
        this.cache.set(next);
      }),
    );
  }

  /** Invalida uma entrada (ex.: depois de editar a empresa no admin). */
  invalidate(id: number): void {
    const next = { ...this.cache() };
    delete next[id];
    this.cache.set(next);
  }
}

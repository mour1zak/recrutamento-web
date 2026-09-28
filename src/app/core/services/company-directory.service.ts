import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { Company, Paginated, UserSummary } from '../models';

/**
 * Cache de nomes de empresa + descoberta de empresas.
 *
 * O backend não expõe `GET /companies` (lista) — apenas `GET /companies/:id`.
 * A lista exibida é portanto a que o backend PERMITE descobrir: empresas com
 * vagas (`GET /jobs/mine`, que para o ADMIN traz todas as empresas) ou com
 * recrutadores vinculados (`GET /users`). Não há varredura de ids nem
 * paginação de cliente: o front apresenta exatamente o contrato que existe,
 * e a regra fica escrita na tela em linguagem de produto.
 *
 * Empresas criadas nesta sessão ficam registradas (`register`) a partir da
 * resposta real do `POST /companies`, para aparecerem nos seletores até que
 * ganhem vagas/usuários que as tornem descobríveis.
 */
@Injectable({ providedIn: 'root' })
export class CompanyDirectoryService {
  readonly api = inject(ApiClient);

  private readonly cache = signal<Record<number, string>>({});

  /** Empresas criadas/conhecidas nesta sessão (não dependem de descoberta). */
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

  /** Registra uma empresa criada/agora conhecida (idempotente por id). */
  register(company: Company): void {
    this.registered.update((current) => {
      const others = current.filter((item) => item.id !== company.id);
      return [company, ...others];
    });
    this.cache.update((current) => ({ ...current, [company.id]: company.name }));
  }

  /** Descoberta barata: ids presentes em vagas e usuários + registradas. */
  discoverCompanies(): Observable<Company[]> {
    return forkJoin({
      jobs: this.api
        .get<Paginated<Company & { companyId?: number }>>('jobs/mine', { page: 1, limit: 100 })
        .pipe(catchError(() => of({ data: [] as unknown[] } as Paginated<Company & { companyId?: number }>))),
      users: this.api
        .get<Paginated<UserSummary>>('users', { page: 1, limit: 100 })
        .pipe(catchError(() => of({ data: [] as UserSummary[] } as Paginated<UserSummary>))),
    }).pipe(
      map(({ jobs, users }) => {
        const ids = new Set<number>();
        jobs.data.forEach((job) => {
          const companyId = (job as { companyId?: number }).companyId ?? job.id;
          if (companyId) ids.add(companyId);
        });
        users.data.forEach((user) => {
          if (user.companyId) ids.add(user.companyId);
        });
        return [...ids].sort((a, b) => a - b);
      }),
      switchMap((ids) => {
        const registered = this.registered();
        const registeredIds = new Set(registered.map((company) => company.id));
        const toFetch = ids.filter((id) => !registeredIds.has(id));

        if (toFetch.length === 0) return of(registered);

        return forkJoin(
          toFetch.map((id) => this.api.get<Company>(`companies/${id}`).pipe(catchError(() => of(null)))),
        ).pipe(
          map(
            (companies) =>
              // Registradas primeiro: empresa recém-criada aparece no topo.
              [...registered, ...companies.filter((company): company is Company => company !== null)],
          ),
        );
      }),
      tap((companies) => this.warmCache(companies)),
    );
  }

  /** Invalida uma entrada (ex.: depois de editar a empresa no admin). */
  invalidate(id: number): void {
    const next = { ...this.cache() };
    delete next[id];
    this.cache.set(next);
  }

  private warmCache(companies: Company[]): void {
    const next = { ...this.cache() };
    companies.forEach((company) => {
      next[company.id] = company.name;
    });
    this.cache.set(next);
  }
}

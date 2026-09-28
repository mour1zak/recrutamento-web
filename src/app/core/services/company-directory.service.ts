import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { Company, Paginated, UserSummary } from '../models';

/** Quantos 404s consecutivos encerram a varredura de ids de empresa. */
const PROBE_STOP_AFTER = 8;
/** Janela de ids investigada acima do maior id já conhecido. */
const PROBE_WINDOW = 12;
/** Tamanho do lote paralelo de consulta durante a varredura. */
const PROBE_BATCH = 8;

/**
 * Cache de nomes de empresa + descoberta de empresas.
 *
 * O backend não expõe `GET /companies` (lista) — apenas `GET /companies/:id`.
 * Duas estratégias complementares, ambas só com rotas que existem:
 *
 * - `discoverCompanies()` (barata): ids que aparecem em `GET /jobs/mine`
 *   (ADMIN vê todas as vagas) e `GET /users` (`companyId` dos recrutadores);
 * - `discoverAllCompanies()` (completa, telas de gestão): além desses ids,
 *   varre a faixa `1..maiorId+12` consultando por id, em lotes paralelos, e
 *   para após 8 404s consecutivos. É assim que uma empresa recém-criada —
 *   que ainda não tem vagas nem recrutadores — aparece na lista depois de
 *   um reload (o registro em sessão cobre o intervalo entre criar e recarregar).
 *
 * Empresas criadas nesta sessão ficam registradas (`register`) e entram em
 * qualquer uma das duas descobertas sem depender do backend.
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

  /**
   * Descoberta completa para telas de gestão (ADMIN): descoberta barata +
   * varredura de faixa de ids até 8 404s consecutivos, em lotes de 8.
   */
  discoverAllCompanies(): Observable<Company[]> {
    return this.discoverCompanies().pipe(
      switchMap((seeded) => {
        const known = new Map<number, Company>();
        [...this.registered(), ...seeded].forEach((company) => known.set(company.id, company));

        const maxSeed = seeded.length ? Math.max(...seeded.map((company) => company.id)) : 0;
        const ceiling = maxSeed + PROBE_WINDOW;
        const candidates: number[] = [];
        for (let id = 1; id <= ceiling; id += 1) {
          if (!known.has(id)) candidates.push(id);
        }

        const probe = (index: number, consecutive: number): Observable<Map<number, Company>> => {
          if (index >= candidates.length || consecutive >= PROBE_STOP_AFTER) {
            return of(known);
          }
          const chunk = candidates.slice(index, index + PROBE_BATCH);
          return forkJoin(
            chunk.map((id) =>
              this.api.get<Company>(`companies/${id}`).pipe(
                map((company) => ({ company: company as Company | null })),
                catchError(() => of({ company: null })),
              ),
            ),
          ).pipe(
            switchMap((results) => {
              let nextConsecutive = consecutive;
              results.forEach(({ company }) => {
                if (company) {
                  known.set(company.id, company);
                  nextConsecutive = 0;
                } else {
                  nextConsecutive += 1;
                }
              });
              return probe(index + chunk.length, nextConsecutive);
            }),
          );
        };

        return probe(0, 0).pipe(map((mapById) => [...mapById.values()].sort((a, b) => a.id - b.id)));
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

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs';
import { ApiError } from '../../../core/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { formatRelative, formatSalary } from '../../../core/format';
import { JobsService } from '../../../core/services/jobs.service';
import type { Paginated, PublicJob } from '../../../core/models';
import { AlertComponent } from '../../../shared/ui/alert';
import { EmptyStateComponent } from '../../../shared/ui/empty-state';
import { LoadingComponent } from '../../../shared/ui/loading';
import { PaginationComponent } from '../../../shared/ui/pagination';
import { IconComponent } from '../../../shared/ui/icon';

/**
 * Vitrine pública de vagas (`GET /jobs`) — a tela inicial do produto.
 *
 * Rota pública: só `x-api-key`, sem JWT. O backend devolve apenas vagas
 * `OPEN` de empresas ativas, paginadas (`{data, page, limit, total}`), com
 * `company: {id, name}` embutido e busca textual via `?search`.
 *
 * Filtros/ordenação ficam na URL (compartilhável e sobrevivem a reload).
 */
@Component({
  selector: 'app-jobs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent, EmptyStateComponent, LoadingComponent, PaginationComponent, IconComponent],
  template: `
    <section class="hero">
      <div class="container">
        <h1>Encontre a sua próxima vaga</h1>
        <p class="hero__subtitle">
          Vagas abertas publicadas pelas empresas da plataforma. Candidate-se em poucos cliques e acompanhe cada etapa
          do processo.
        </p>

        <form class="hero__search" (submit)="onSearchSubmit($event, searchInput.value)" role="search">
          <input
            #searchInput
            type="search"
            class="input"
            placeholder="Buscar por cargo, empresa ou palavra-chave…"
            aria-label="Buscar vagas"
            [value]="search()"
          />
          <button type="submit" class="btn btn--primary">Buscar</button>
          @if (search()) {
            <button type="button" class="btn btn--ghost" (click)="applySearch('')">Limpar</button>
          }
        </form>

        <div class="hero__controls">
          <label class="hero__sort">
            <span>Ordenar</span>
            <select class="select" [value]="sortOrder()" (change)="changeSort($event)">
              <option value="relevancia" [disabled]="!search()">Mais relevantes</option>
              <option value="desc">Mais recentes</option>
              <option value="asc">Mais antigas</option>
            </select>
            @if (sortOrder() === 'relevancia') {
              <span class="hero__sort-hint">
                @if (search()) {
                  títulos que contêm a busca vêm primeiro
                } @else {
                  busque algo para ranquear por relevância
                }
              </span>
            }
          </label>
          <label class="checkbox">
            <input type="checkbox" [checked]="onlyRemote()" (change)="toggleRemote($event)" />
            Somente vagas remotas
          </label>
        </div>
      </div>
    </section>

    <div class="container page">
      @if (error()) {
        <app-alert [message]="error()" kind="error" />
      }

      @if (loading()) {
        <app-loading label="Carregando vagas…" />
      } @else if (visibleJobs().length > 0) {
        <div class="row row--between mb-4">
          <p class="muted mb-0">
            {{ result()?.total ?? 0 }} vaga(s) aberta(s){{ searchSuffix() }}
            @if (onlyRemote()) {
              <span>· filtrando remotas nesta página</span>
            }
          </p>
          @if (!auth.isAuthenticated()) {
            <a class="btn btn--sm" routerLink="/auth/login">Entrar para se candidatar</a>
          }
        </div>

        <div class="list">
          @for (job of visibleJobs(); track job.id) {
            <a class="job-card" [routerLink]="['/jobs', job.id]">
              <div class="job-card__top">
                <div>
                  <div class="job-card__title">{{ job.title }}</div>
                  <div class="job-card__company">{{ job.company.name }}</div>
                </div>
                <span class="badge badge--success">Aberta</span>
              </div>

              <div class="job-card__meta">
                <span>
                  <app-icon [name]="job.isRemote ? 'globe' : 'pin'" />
                  {{ job.isRemote ? 'Remota' : 'Presencial' }}
                </span>
                <span><app-icon name="money" /> {{ salary(job) }}</span>
                <span><app-icon name="users" /> {{ job.vacancies }} vaga(s)</span>
                <span><app-icon name="clock" /> {{ published(job) }}</span>
              </div>

              <p class="job-card__excerpt">{{ job.description }}</p>
            </a>
          }
        </div>

        @if (!search()) {
          <app-pagination
            [page]="result()?.page ?? 1"
            [limit]="result()?.limit ?? pageSize"
            [total]="result()?.total ?? 0"
            label="vagas"
            (pageChange)="changePage($event)"
          />
        } @else {
          <p class="field__hint mt-4">
            A busca consulta o catálogo público aberto (título, descrição e empresa) em uma única página,
            ordenada por {{ sortOrder() === 'asc' ? 'mais antigas' : 'mais recentes' }}.
          </p>
        }
      } @else if (!error()) {
        <app-empty-state
          icon="search"
          title="Nenhuma vaga aberta com esses filtros"
          description="A busca usa o índice do backend (título e descrição). Tente outro termo ou remova os filtros."
        >
          <button type="button" class="btn" (click)="applySearch('')">Ver todas as vagas</button>
        </app-empty-state>
      }
    </div>
  `,
  styles: [
    `
      .hero {
        background:
          radial-gradient(1200px 400px at 15% -10%, rgb(79 70 229 / 12%), transparent 60%),
          linear-gradient(180deg, #ffffff 0%, var(--color-bg) 100%);
        border-bottom: 1px solid var(--color-border);
        padding-block: var(--space-7) var(--space-6);
      }

      .hero h1 {
        font-size: 2rem;
        letter-spacing: -0.03em;
      }

      .hero__subtitle {
        color: var(--color-text-muted);
        max-width: 62ch;
        margin-block: var(--space-2) var(--space-5);
      }

      .hero__search {
        display: flex;
        gap: var(--space-2);
        max-width: 720px;
      }

      .hero__controls {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-5);
        align-items: center;
        margin-top: var(--space-4);
        font-size: 0.8125rem;
        color: var(--color-text-muted);
      }

      .hero__sort {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
      }

      .hero__sort .select {
        width: auto;
        padding: 6px 10px;
        font-size: 0.8125rem;
      }

      .hero__sort-hint {
        font-size: 0.75rem;
        color: var(--color-text-subtle);
      }

      @media (max-width: 720px) {
        .hero__search {
          flex-direction: column;
        }

        .hero h1 {
          font-size: 1.6rem;
        }
      }
    `,
  ],
})
export class JobsPageComponent {
  private readonly jobs = inject(JobsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly pageSize = 10;
  protected readonly result = signal<Paginated<PublicJob> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly sortOrder = signal<'asc' | 'desc' | 'relevancia'>('desc');
  /** Filtro de cliente (o backend não expõe `isRemote` como query). */
  protected readonly onlyRemote = signal(false);

  /**
   * Linhas exibidas: filtro remoto (cliente) + ranking de relevância.
   *
   * "Mais relevantes" é um ranking de página (o backend só ordena por data):
   * com busca ativa, títulos que contêm o termo vêm antes das descrições que
   * contêm o termo. Sem busca, equivale a "mais recentes".
   */
  protected readonly visibleJobs = computed(() => {
    let data = this.result()?.data ?? [];
    if (this.onlyRemote()) data = data.filter((job) => job.isRemote);
    if (this.sortOrder() === 'relevancia' && this.search()) {
      const term = this.search().toLowerCase();
      const score = (job: PublicJob) =>
        (job.title.toLowerCase().includes(term) ? 2 : 0) +
        (job.company.name.toLowerCase().includes(term) ? 1 : 0) +
        (job.description.toLowerCase().includes(term) ? 1 : 0);
      data = [...data].sort((a, b) => score(b) - score(a));
    }
    return data;
  });

  constructor() {
    // URL é a fonte de verdade dos filtros (reload/voltar/compartilhar).
    this.route.queryParamMap
      .pipe(
        tap((params) => {
          this.search.set(params.get('search') ?? '');
          this.page.set(Number(params.get('page') ?? 1) || 1);
          const order = params.get('sortOrder');
          this.sortOrder.set(order === 'asc' ? 'asc' : order === 'relevancia' ? 'relevancia' : 'desc');
        }),
        switchMap(() => {
          const order = this.sortOrder() === 'asc' ? 'asc' : 'desc';
          const term = this.search();
          // Com termo: busca ampla no cliente (título+descrição+empresa), página
          // única. Sem termo: paginação normal do backend.
          return term
            ? this.jobs.searchPublicJobs(term, order)
            : this.jobs.listPublicJobs({ page: this.page(), limit: this.pageSize, sortOrder: order });
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (apiError: ApiError) => {
          this.loading.set(false);
          this.error.set(apiError.message);
        },
      });
  }

  protected searchSuffix(): string {
    const term = this.search();
    return term ? ` para "${term}"` : '';
  }

  protected salary(job: PublicJob): string {
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  protected published(job: PublicJob): string {
    return `publicada ${formatRelative(job.createdAt)}`;
  }

  /** Sem preventDefault o browser recarrega a página (form sem action) e o filtro se perde. */
  protected onSearchSubmit(event: Event, value: string): void {
    event.preventDefault();
    this.applySearch(value);
  }

  protected applySearch(value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: value.trim() || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected changePage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected changeSort(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const value = raw === 'asc' ? 'asc' : raw === 'relevancia' ? 'relevancia' : 'desc';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sortOrder: value, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected toggleRemote(event: Event): void {
    this.onlyRemote.set((event.target as HTMLInputElement).checked);
  }
}

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { Company, CompanyStats } from '../models';

/** String presente e com conteúdo (opcional vazio nunca vira campo no body). */
function filled(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export interface CreateCompanyInput {
  name: string;
  cnpj?: string | null;
  description?: string | null;
  /** Obrigatório no backend (`^\d{5}-?\d{3}$`) — enriquecido via ViaCEP. */
  cep: string;
}

export type UpdateCompanyInput = Partial<CreateCompanyInput>;

/**
 * Empresas (área ADMIN) + indicadores (`GET /companies/:id/stats`, usado por
 * RECRUITER na própria empresa e por ADMIN em qualquer uma).
 *
 * O backend NÃO tem listagem de empresas — apenas `GET /companies/:id`. A tela
 * de gestão do admin monta a lista por descoberta de ids (a partir de
 * `GET /users` e `GET /jobs/mine`), o que cobre o caso de uso real sem fingir
 * uma rota que não existe.
 */
@Injectable({ providedIn: 'root' })
export class CompaniesService {
  private readonly api = inject(ApiClient);

  create(input: CreateCompanyInput): Observable<Company> {
    // Campo opcional vazio NÃO é enviado: o backend usa `whitelist` +
    // `forbidNonWhitelisted` e `@IsOptional()` aceita null, mas mandar "" em
    // `cnpj` quebraria o `@Matches` dos 14 dígitos.
    const body: Record<string, unknown> = { name: input.name, cep: input.cep };
    if (filled(input.cnpj)) body['cnpj'] = input.cnpj;
    if (filled(input.description)) body['description'] = input.description;
    return this.api.post<Company>('companies', body);
  }

  get(id: number): Observable<Company> {
    return this.api.get<Company>(`companies/${id}`);
  }

  update(id: number, input: UpdateCompanyInput): Observable<Company> {
    // PATCH parcial: só o que foi informado (e não está vazio) vai no corpo.
    const body: Record<string, unknown> = {};
    if (filled(input.name)) body['name'] = input.name;
    if (filled(input.cnpj)) body['cnpj'] = input.cnpj;
    if (filled(input.description)) body['description'] = input.description;
    if (filled(input.cep)) body['cep'] = input.cep;
    return this.api.patch<Company>(`companies/${id}`, body);
  }

  deactivate(id: number): Observable<Company> {
    return this.api.patch<Company>(`companies/${id}/deactivate`);
  }

  reactivate(id: number): Observable<Company> {
    return this.api.patch<Company>(`companies/${id}/reactivate`);
  }

  getStats(id: number): Observable<CompanyStats> {
    return this.api.get<CompanyStats>(`companies/${id}/stats`);
  }
}

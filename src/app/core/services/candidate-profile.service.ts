import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client';
import type { CandidateProfile, CandidateProfileFull, CepLookup } from '../models';

export interface UpdateCandidateProfileInput {
  headline?: string | null;
  summary?: string | null;
  phone?: string | null;
  cep?: string | null;
  skills?: string[];
}

/**
 * Perfil do candidato.
 *
 * - `GET /candidates/me` → `404 candidate_profile_not_found` enquanto o perfil
 *   não existe: é estado legítimo ("ainda não preenchido"), não erro. As telas
 *   tratam esse caso mostrando o formulário em branco.
 * - `PATCH /candidates/me` é *upsert*: a primeira chamada cria o perfil.
 * - `street`/`city`/`state` NUNCA são enviados: quem resolve o endereço a
 *   partir do CEP é o backend (integração ViaCEP). Enviar esses campos
 *   causaria `400` (`forbidNonWhitelisted`).
 */
@Injectable({ providedIn: 'root' })
export class CandidateProfileService {
  private readonly api = inject(ApiClient);

  getMine(): Observable<CandidateProfileFull> {
    return this.api.get<CandidateProfileFull>('candidates/me');
  }

  updateMine(input: UpdateCandidateProfileInput): Observable<CandidateProfileFull> {
    const body: Record<string, unknown> = {};
    if (input.headline !== undefined) body['headline'] = input.headline ?? '';
    if (input.summary !== undefined) body['summary'] = input.summary ?? '';
    if (input.phone !== undefined) body['phone'] = input.phone ?? '';
    if (input.cep !== undefined && input.cep !== null && input.cep !== '') body['cep'] = input.cep;
    if (input.skills !== undefined) body['skills'] = input.skills;
    return this.api.patch<CandidateProfileFull>('candidates/me', body);
  }

  /**
   * Visão do recrutador sobre um candidato (completa ou reduzida, decidida
   * pelo backend conforme o estágio da candidatura — nunca 403, sempre 200/404).
   */
  getByUserId(userId: number): Observable<CandidateProfile> {
    return this.api.get<CandidateProfile>(`candidates/${userId}`);
  }
}

/** Consulta de CEP exposta pelo backend (`GET /cep/:cep`, pública + API key). */
@Injectable({ providedIn: 'root' })
export class CepService {
  private readonly api = inject(ApiClient);

  lookup(cep: string): Observable<CepLookup> {
    return this.api.get<CepLookup>(`cep/${encodeURIComponent(cep)}`);
  }
}

import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient, FileDownload } from '../http/api-client';
import type { DocumentSummary, DocumentType, UploadedDocument } from '../models';

/** Whitelist de MIME do backend (`documents.module.ts`) — validada antes do envio. */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const ACCEPT_ATTRIBUTE =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Limite padrão do backend (`MAX_UPLOAD_SIZE_MB=5`). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface UploadValidation {
  ok: boolean;
  reason?: 'mime_type_invalido' | 'arquivo_excede_tamanho_maximo' | 'arquivo_ausente';
  message?: string;
}

/** Valida no cliente antes de gastar o upload — mesmas regras do backend. */
const ACCEPTED_EXTENSIONS = /\.(pdf|doc|docx)$/i;

export function validateUpload(file: File | null | undefined): UploadValidation {
  if (!file) {
    return { ok: false, reason: 'arquivo_ausente', message: 'Selecione um arquivo para enviar.' };
  }
  const knownType = ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number]);
  // Alguns sistemas/browsers não preenchem `File.type` (ex.: .doc em certos
  // Linux). Nesses casos a extensão salva o candidato de um falso negativo no
  // cliente — o backend continua sendo a autoridade (multer valida o MIME).
  if (!knownType && !(file.type === '' && ACCEPTED_EXTENSIONS.test(file.name))) {
    return {
      ok: false,
      reason: 'mime_type_invalido',
      message: 'Formato não aceito. Envie o currículo em PDF, DOC ou DOCX.',
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: 'arquivo_excede_tamanho_maximo',
      message: 'Arquivo grande demais — o limite é 5 MB.',
    };
  }
  return { ok: true };
}

/**
 * Documentos (currículo e anexos).
 *
 * `GET /documents/:id` responde com `res.download()` e exige `x-api-key` +
 * JWT — não dá para apontar um `<a href>` para a rota. Por isso o download
 * busca o blob autenticado e dispara o salvamento no cliente.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly api = inject(ApiClient);

  upload(file: File, type: DocumentType): Observable<UploadedDocument> {
    const form = new FormData();
    // Ordem irrelevante para o multer, mas `type` é campo de texto obrigatório.
    form.append('type', type);
    form.append('file', file, file.name);
    return this.api.upload<UploadedDocument>('documents', form);
  }

  listMine(): Observable<DocumentSummary[]> {
    return this.api.get<DocumentSummary[]>('documents/me');
  }

  /** Baixa o arquivo e já dispara o "salvar como" no navegador. */
  download(id: number, fallbackFilename = `documento-${id}`): Observable<FileDownload> {
    return this.api.download(`documents/${id}`, fallbackFilename).pipe(
      map((result) => {
        saveBlob(result.blob, result.filename);
        return result;
      }),
    );
  }

  /**
   * Busca o binário SEM disparar download — para pré-visualizar no navegador
   * (o "ver o que eu enviei" estilo Glassdoor).
   */
  fetch(id: number, fallbackFilename = `documento-${id}`): Observable<FileDownload> {
    return this.api.download(`documents/${id}`, fallbackFilename);
  }
}

/**
 * Abre um blob em nova aba (preview de PDF enviado). O revoke é adiado porque
 * a aba nova precisa conseguir ler o object URL depois do clique.
 */
export function openBlobInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Cria um link temporário e clica — padrão para download de blob autenticado. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Libera a memória no próximo tick (alguns navegadores precisam do clique antes).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError, translateApiError } from '../api-error';

/** Marca requisições que não devem passar pela lógica de auth/refresh do interceptor. */
export const SKIP_AUTH_HEADER = 'X-Skip-Auth';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Resultado de um download: conteúdo binário + nome de arquivo sugerido pelo servidor. */
export interface FileDownload {
  blob: Blob;
  filename: string;
}

function toHttpParams(params?: QueryParams): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    httpParams = httpParams.set(key, String(value));
  }
  return httpParams;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      /* mantém o fallback */
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch?.[1] ?? fallback;
}

/**
 * Camada fina sobre `HttpClient`: monta a URL absoluta da API e converte toda
 * falha de rede/HTTP em `ApiError` (mensagem já traduzida para pt-BR).
 *
 * Os services de feature usam isto — nunca `HttpClient` direto — para que o
 * tratamento de erro seja consistente em todo o app.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl.replace(/\/$/, '');

  url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, '')}`;
  }

  get<T>(path: string, params?: QueryParams, headers?: HttpHeaders): Observable<T> {
    return this.http
      .get<T>(this.url(path), { params: toHttpParams(params), headers })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))));
  }

  post<T>(path: string, body?: unknown, headers?: HttpHeaders): Observable<T> {
    return this.http
      .post<T>(this.url(path), body ?? {}, { headers })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))));
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .patch<T>(this.url(path), body ?? {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))));
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .put<T>(this.url(path), body ?? {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))));
  }

  delete<T>(path: string): Observable<T> {
    return this.http
      .delete<T>(this.url(path))
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))));
  }

  /** `POST` sem corpo útil (ex.: logout devolve 204). */
  postVoid(path: string, body?: unknown): Observable<void> {
    return this.post<void>(path, body).pipe(map(() => undefined));
  }

  /** Upload multipart (`POST /documents`) — o interceptor NÃO define Content-Type aqui. */
  upload<T>(path: string, form: FormData): Observable<T> {
    return this.http
      .post<T>(this.url(path), form)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))));
  }

  /**
   * Download autenticado (`GET /documents/:id` responde com `res.download()`,
   * ou seja, `Content-Disposition: attachment`). Como o endpoint exige
   * `x-api-key` + `Bearer`, não dá para usar um `<a href>` simples: buscamos o
   * blob com os headers e disparamos o download no cliente.
   */
  download(path: string, fallbackFilename: string): Observable<FileDownload> {
    return this.http.get(this.url(path), { responseType: 'blob', observe: 'response' }).pipe(
      map((response) => ({
        blob: response.body ?? new Blob(),
        filename: filenameFromDisposition(response.headers.get('Content-Disposition'), fallbackFilename),
      })),
      catchError((error: HttpErrorResponse) => throwError(() => translateApiError(error))),
    );
  }
}

/** Reexporta o tipo de erro para os componentes importarem de um lugar só. */
export type { ApiError };

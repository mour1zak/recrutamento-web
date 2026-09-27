import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { apiKeyInterceptor } from './core/http/api-key.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';

/**
 * Providers raiz.
 *
 * - `provideHttpClient(withInterceptors([...]))`: a ordem importa — o interceptor
 *   de API key roda primeiro (anexa `x-api-key` em toda chamada da API) e o de
 *   auth depois (anexa o Bearer e trata renovação em 401).
 * - `withComponentInputBinding()`: parâmetros de rota (ex.: `:id`) chegam como
 *   `input()` nos componentes.
 * - zoneless: o app inteiro é baseado em signals (padrão Angular 21).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([apiKeyInterceptor, authInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
  ],
};

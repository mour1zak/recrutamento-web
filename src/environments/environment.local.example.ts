/**
 * EXEMPLO — copie para `environment.local.ts` (arquivo ignorado pelo git) e
 * cole a SUA `x-api-key` (mesmo valor do `API_KEY` no `.env` do backend).
 *
 *   cp src/environments/environment.local.example.ts src/environments/environment.local.ts
 *
 * Por que um arquivo ignorado: assim o `git pull` das atualizações do front
 * NUNCA conflita com a sua chave local — ela não é versionada.
 * Suba o app com: npm run start:local
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiKey: 'COLE_AQUI_O_API_KEY_DO_SEU_ENV',
  appName: 'Recruta',
  // Desligado por padrão: expor emails/senhas de seed na tela de login é
  // vazamento de informação. Para uma DEMO controlada, preencha aqui (ou no
  // environment.local.ts, que não é versionado) e o painel volta a aparecer.
  demoAccounts: [] as { role: string; label: string; email: string; password: string }[],
};

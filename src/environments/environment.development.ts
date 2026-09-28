/**
 * Substituições locais para `ng serve` (configuration "development").
 *
 * Este arquivo é versionado apenas como exemplo: copie-o para
 * `environment.development.local.ts` (ignorado pelo git) se quiser apontar
 * para outra URL de API ou usar a sua própria `x-api-key` sem sujar o diff.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiKey: 'dev-api-key-troque-pelo-valor-do-seu-env',
  appName: 'LinklDoor',
  // Desligado por padrão: expor emails/senhas de seed na tela de login é
  // vazamento de informação. Para uma DEMO controlada, preencha aqui (ou no
  // environment.local.ts, que não é versionado) e o painel volta a aparecer.
  demoAccounts: [] as { role: string; label: string; email: string; password: string }[],
};

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
  appName: 'Recruta',
  demoAccounts: [
    { role: 'CANDIDATE', label: 'Candidato (seed)', email: 'candidato@recrutamento.test', password: 'Senha@123' },
    { role: 'RECRUITER', label: 'Recrutador (seed)', email: 'recrutador@recrutamento.test', password: 'Senha@123' },
    { role: 'ADMIN', label: 'Administrador (seed)', email: 'admin@recrutamento.test', password: 'Senha@123' },
  ] as { role: string; label: string; email: string; password: string }[],
};

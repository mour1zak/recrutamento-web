/**
 * Configuração de produção.
 *
 * Preencha antes de publicar:
 * - `apiUrl`: URL pública da API (o backend precisa ter `CORS_ORIGIN` incluindo
 *   a origem deste site);
 * - `apiKey`: valor do `API_KEY` do backend. Lembrete honesto: em um SPA a chave
 *   fica visível no bundle — em produção o recomendado é injetá-la num
 *   BFF/gateway (nginx/edge function) e deixar `apiKey` vazio aqui.
 * - `demoAccounts`: vazio em produção (o painel de contas do seed é ferramenta
 *   de demonstração, não deve existir fora dela).
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.exemplo.com.br',
  apiKey: 'PREencha-com-a-api-key-de-producao',
  appName: 'Gipper',
  demoAccounts: [] as { role: string; label: string; email: string; password: string }[],
};

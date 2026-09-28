/**
 * Configuração de desenvolvimento.
 *
 * `apiUrl` aponta direto para o backend NestJS (porta 3000) — sem proxy e sem
 * túnel: o backend já tem CORS habilitado (`CORS_ORIGIN` no .env dele, ou
 * qualquer origem quando a variável não está definida).
 *
 * `apiKey` é o header fixo `x-api-key` que TODA rota do backend exige (até as
 * públicas de auth). Ele precisa ser idêntico ao `API_KEY` do `.env` do
 * backend. Não é um segredo de usuário: é uma chave de aplicação, e num
 * cliente SPA ela é inevitavelmente visível no bundle — a camada de
 * autorização de verdade continua sendo o JWT + as permission keys do RBAC.
 *
 * Para trocar sem rebuildar, use `environment.development.ts` (arquivo local,
 * fora do versionamento) ou substitua o valor no build de produção.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiKey: 'DEFINA_SUA_API_KEY_NO_START_LOCAL',
  /** Nome exibido no cabeçalho/rodapé. */
  appName: 'Gipper',
  /**
   * Contas de demonstração (opcional). Quando preenchidas, a tela de login
   * mostra um painel "contas deste ambiente" com botão de preenchimento
   * automático — útil para a apresentação ao cliente. São credenciais do SEED
   * do backend (usuários criados por `npx prisma db seed`), não dados
   * inventados pelo front. Deixe vazio para não exibir nada.
   */
  demoAccounts: [
    { role: 'CANDIDATE', label: 'Candidato (seed)', email: 'candidato@recrutamento.test', password: 'Senha@123' },
    { role: 'RECRUITER', label: 'Gipperdor (seed)', email: 'recrutador@recrutamento.test', password: 'Senha@123' },
    { role: 'ADMIN', label: 'Administrador (seed)', email: 'admin@recrutamento.test', password: 'Senha@123' },
  ] as { role: string; label: string; email: string; password: string }[],
};

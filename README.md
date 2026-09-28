# Gipper — Frontend Angular (Digital Recruitment)

Aplicação web (SPA) que consome a API [`recrutamento-api`](https://github.com/mour1zak/recrutamento-api) —
NestJS + PostgreSQL + Prisma, com JWT, RBAC dinâmico, upload de currículo e
integração externa de CEP.

Este é um repositório **separado e independente** do backend: nenhum código dos
dois se mistura. O front roda em `http://localhost:4200` e chama a API direto em
`http://localhost:3000` (sem proxy, sem túnel — o backend já tem CORS habilitado).

**Nada nesta aplicação usa dado inventado.** Toda informação exibida vem de uma
resposta real da API; quando um dado não existe (ou o usuário não tem escopo
para vê-lo), a tela mostra estado vazio/erro explicado — nunca um placeholder
fingindo ser conteúdo.

---

## 1. Stack

| Item | Escolha | Por quê |
|---|---|---|
| Framework | **Angular 21 LTS** | `standalone` por padrão, `signals`, novo control flow (`@if`/`@for`), zoneless |
| Reatividade | Signals + RxJS | Estado local em signals; HTTP em Observables (padrão do `HttpClient`) |
| Change detection | `provideZonelessChangeDetection()` | Sem Zone.js: menos bundle, updates explícitos por signal |
| UI | **CSS próprio com design tokens** (sem framework) | Paleta verde-profundo/creme/coral inspirada em template Figma de recrutamento; fontes Sora (títulos) + Inter (texto) via Google Fonts com fallback system-ui offline |
| Marca | **Gipper — Digital Recruitment** | Lockup com marca própria (SVG inline: "G" branco em bloco verde + losango coral) no header, footer e landing |
| Forms | `ReactiveFormsModule` | Validar no cliente as mesmas regras dos DTOs do backend |
| Testes | **Vitest + jsdom** (via `@angular/build:unit-test`) + `HttpTestingController` | 131 testes cobrindo interceptors, guards, contratos HTTP e os 3 fluxos de negócio |
| Build | `@angular/build:application` | Produz SPA estático; initial **310 kB (87 kB gzip)** |

Requisitos: **Node 20.19+ / 22.12+** e npm. (O backend exige Node 22+; o front
funciona em Node 20.)

---

## 2. Como rodar

### 2.1 Suba o backend primeiro

Siga o README da API (instalação, `prisma migrate dev`, `prisma generate`,
`prisma db seed`, `.env`). O seed cria um usuário de cada papel com a senha
`Senha@123`:

| Papel | Email |
|---|---|
| ADMIN | `admin@recrutamento.test` |
| RECRUITER | `recrutador@recrutamento.test` (vinculado à "Empresa Seed") |
| CANDIDATE | `candidato@recrutamento.test` |

### 2.2 Configure a `x-api-key` do front (uma vez só, sem conflito de pull)

O backend exige o header `x-api-key` em **todas** as rotas (inclusive nas
públicas de auth). A chave vive em um arquivo **ignorado pelo git**, então os
`git pull` das atualizações nunca conflitam com ela:

```bash
cp src/environments/environment.local.example.ts src/environments/environment.local.ts
# edite environment.local.ts: cole o API_KEY do .env do backend
```

E suba com:

```bash
npm run start:local   # http://localhost:4200 usando environment.local.ts
```

(`npm start` usa o `environment.ts` base, com chave placeholder — serve para
CI/build; para rodar contra o seu backend, use sempre `npm run start:local`.
O arquivo `environment.development.ts` não é versionado: se existir um sobrando
na sua máquina, pode apagá-lo.)

> **Sobre a chave no bundle:** em um SPA qualquer valor embutido é público. A
> `x-api-key` é uma chave de *aplicação* (camada extra pedida pelo enunciado),
> não um segredo de usuário — a autorização real continua sendo o JWT + as
> permission keys do RBAC, verificadas no backend em cada request. Para produção,
> o caminho é um BFF/gateway que injete a chave fora do navegador.

Também dá para apontar para outra API sem tocar no código versionado: crie
`src/environments/environment.local.ts` (ignorado pelo git) e ajuste o
`fileReplacements` do `angular.json`.

### 2.3 Suba o front

```bash
npm install        # só na primeira vez (ou quando o package-lock mudar)
npm run start:local
```

### 2.4 Atualizando o front (git)

```bash
git pull origin main     # recebe os commits novos
# npm install SOMENTE se o package.json/package-lock tiver mudado no pull
```

Outros comandos:

```bash
npm test           # 131 testes (vitest + jsdom)
npm run test:watch
npm run build      # build de produção em dist/recrutamento-web/browser
npm run typecheck  # tsc --noEmit
npm run format     # prettier
```

### 2.4 Se a API não responder

A tela mostra: *"Não foi possível falar com a API. Verifique se o backend está
rodando em http://localhost:3000."* — as causas mais comuns são backend
desligado, `API_KEY` divergente entre front e `.env`, ou `CORS_ORIGIN` definido
no backend sem incluir `http://localhost:4200`.

---

## 3. Arquitetura

```
src/
├── environments/            apiUrl + apiKey (+ contas de demo opcionais)
├── styles.css               design system global (tokens, botões, forms, tabelas,
│                            badges, modal, toasts, funil, timeline, responsivo)
└── app/
    ├── app.config.ts        providers: HttpClient + interceptors, router, zoneless
    ├── app.routes.ts        rotas por feature (lazy) + guards por papel/permissão
    ├── core/
    │   ├── models.ts        tipos = payloads reais do backend (enums, paginação,
    │   │                    payload completo × reduzido, stats, RBAC)
    │   ├── api-error.ts     mapa reason/status → texto pt-BR (contrato do briefing)
    │   ├── format.ts        rótulos de status, moeda/data/bytes, máscaras
    │   │                    (CEP, CNPJ, telefone) e conversão datetime-local→ISO
    │   ├── toast.service.ts notificações globais
    │   ├── http/
    │   │   ├── api-client.ts      wrapper do HttpClient + download blob + upload
    │   │   ├── api-key.interceptor.ts  x-api-key em toda chamada da API
    │   │   └── auth.interceptor.ts     Bearer + refresh single-flight em 401
    │   ├── auth/
    │   │   ├── auth.service.ts         sessão (sessionStorage), logout, empresa própria
    │   │   └── permissions.service.ts  espelho client-side do RBAC (8/13/24 keys)
    │   ├── guards/auth.guards.ts       authGuard, roleGuard, permissionGuard, guestGuard
    │   └── services/                   jobs, applications, interviews, documents,
    │                                   candidate-profile + cep, companies, users,
    │                                   roles, company-directory (cache/descoberta)
    ├── layout/              shell (header + conteúdo + rodapé + toasts)
    ├── shared/
    │   ├── forms/cep-field.ts   campo CEP com autopreenchimento (CVA reutilizável)
    │   └── ui/                  badge, status-badges, alert, empty-state, loading,
    │                            pagination, modal, confirm-dialog
    └── features/
        ├── auth/            login, cadastro
        ├── jobs/            vitrine pública, detalhe da vaga + candidatura
        ├── candidate/       minhas candidaturas, candidatura (entrevistas, desistência),
        │                    perfil + documentos
        ├── recruiter/       painel, minhas vagas, criar/editar vaga, candidaturas da vaga,
        │                    candidatura em tela cheia, indicadores
        └── admin/           empresas, formulário de empresa (CEP), usuários, papéis
```

**Princípios aplicados**

- **Services isolam HTTP**; componentes nunca chamam `HttpClient` direto.
- **Um interceptor** para headers (não repetição em cada serviço).
- **Guards por papel + permission key**: a UI não oferece a ação que o backend
  responderia com `403` (pedido explícito do briefing).
- **Entrada estilo portal, vitrine pública**: a raiz (`/`) é uma landing com a
  proposta do produto; a **vitrine de vagas é pública** (espelhando o contrato do
  backend, onde `GET /jobs` exige só `x-api-key`) — ver vagas é grátis, como no
  Glassdoor/Indeed. **Agir** é que exige sessão: candidatar-se, candidaturas,
  painéis e administração continuam atrás do login. O rodapé fala a língua do
  cliente final: nada de "frontend consumindo a API X".
- **Navegação por papel no header**: cada perfil vê o próprio menu; para o ADMIN
  a tela de vagas se chama "Todas as vagas" (porque para ele é isso mesmo).
- **Tabelas de transição espelhadas no backend** (`JOB_STATUS_TRANSITIONS`,
  `APPLICATION_STATUS_TRANSITIONS`): os botões de status só mostram destinos
  válidos, então `400 invalid_status_transition` não ocorre por clique.
- **Validação de cliente igual ao DTO**: mesmos limites (ex.: senha ≥ 8 no
  registro, `title` ≤ 160, `coverLetter` ≤ 2000, `skills` ≤ 30×60, CNPJ 14
  dígitos, CEP `00000-000`), para dar feedback antes da chamada.
- **Payloads condicionais respeitados**: `ApplicationFull × ApplicationReduced` e
  `CandidateProfileFull × Reduced` são tipos distintos no front; a tela mostra o
  que veio e explica por que o resto não está visível.

---

## 4. Autenticação

Duas camadas, como no backend:

1. **`x-api-key`** — anexado pelo `apiKeyInterceptor` em toda chamada para
   `apiUrl` (e nunca vazado para outro host).
2. **JWT (`Authorization: Bearer`)** — anexado pelo `authInterceptor` quando há
   sessão, exceto em rotas de auth e nas rotas públicas sem JWT (`GET /jobs`,
   `GET /cep/:cep`), para não causar `401`/refresh desnecessário em página
   pública.

**Renovação automática:** em `401`, o interceptor chama
`AuthService.refresh()` (`POST /auth/refresh`) e repete o request original **uma
única vez**. O refresh é *single-flight* (`shareReplay`): N requests expirados
em paralelo geram **uma** renovação — essencial porque o backend **rotaciona** o
refresh token e invalidaria o segundo uso. Falhou a renovação → sessão limpa +
redirect para `/auth/login?expired=1` (a tela de login mostra "Sua sessão
expirou").

`401` com mensagem de API key inválida **não** derruba a sessão (é erro de
configuração do front, e mascarar isso dificultaria o diagnóstico).

**Armazenamento:** tokens em memória (signals) + espelho em `localStorage`.
A primeira versão usava `sessionStorage`, mas ele é **isolado por aba**: qualquer
link aberto em nova aba ("ver na vitrine", ctrl+clique) caía no login com a
conta ativa ao lado — parecia "desconectou do nada". Com `localStorage` a sessão
é compartilhada entre abas e sobrevive a reload; "Sair" e refresh inválido
limpam tudo. Trade-off aceito e documentado: a sessão persiste até logout
(como portais do mercado); PII exibida segue minimizada pelo backend.

**Redirecionamento pós-login:** a resposta devolve `user.role`, então
candidato → `/jobs`, recrutador → `/recruiter`, admin → `/admin`. `returnUrl`
é respeitado (e validado contra open-redirect: só caminhos internos).

---

## 5. Cobertura das rotas do backend

Todas as rotas de negócio viram tela; as 2 exceções são mecanismo técnico.

| Rota | Onde aparece |
|---|---|
| `GET /health` | — (infra, sem interação de usuário) |
| `POST /auth/register` | `/auth/register` (cadastro de candidato, já entra logado) |
| `POST /auth/login` | `/auth/login` (tela única para os 3 papéis) |
| `POST /auth/refresh` | interceptor de auth (nunca vira tela) |
| `POST /auth/logout` | botão **Sair** no header |
| `GET /cep/:cep` | `app-cep-field` (autopreenchimento em empresa e perfil) |
| `POST /companies` | `/admin/companies/new` |
| `GET /companies/:id` | edição de empresa, cache de nomes, empresa do recrutador |
| `PATCH /companies/:id` | `/admin/companies/:id/edit` |
| `PATCH /companies/:id/deactivate` / `reactivate` | lista de empresas (com diálogo de confirmação) |
| `GET /companies/:id/stats` | `/recruiter` (cards + funil) e `/recruiter/stats` (ADMIN escolhe a empresa) |
| `POST /jobs` | `/recruiter/jobs/new` (ADMIN escolhe a empresa) |
| `GET /jobs` | `/jobs` — vitrine **pública** com busca, paginação e ordenação (mesmo contrato do backend: só `x-api-key`) |
| `GET /jobs/mine` | `/recruiter/jobs` |
| `GET /jobs/:id` | `/jobs/:id` (autenticado) e `/recruiter/jobs/:jobId` |
| `PATCH /jobs/:id` | `/recruiter/jobs/:jobId/edit` |
| `PATCH /jobs/:id/status` | "Minhas vagas" → **Status** e header da tela de candidaturas |
| `GET /candidates/me` · `PATCH /candidates/me` | `/candidate/profile` (PATCH é upsert) |
| `GET /candidates/:userId` | cartão de candidato na avaliação do recrutador |
| `POST /jobs/:jobId/applications` | botão **Candidatar-se** em `/jobs/:id` (modal com carta + currículo) |
| `GET /applications/me` | `/candidate/applications` (filtro por status + paginação) |
| `GET /applications/:id` | `/candidate/applications/:id` e `/recruiter/applications/:id` |
| `GET /jobs/:jobId/applications` | `/recruiter/jobs/:jobId` (fila de triagem) |
| `PATCH /applications/:id/status` | painel de avaliação (botões = transições válidas, motivo opcional) |
| `PATCH /applications/:id/withdraw` | candidatura do candidato → **Desistir** (com motivo) |
| `POST /applications/:id/interviews` | painel de avaliação → **Agendar entrevista** |
| `GET /applications/:id/interviews` | entrevistas na candidatura (candidato e recrutador) |
| `GET /interviews/:id` | service pronto (uso pontual) |
| `PATCH /interviews/:id` | concluir / cancelar / no-show / **reagendar** (201 + nova entrevista) / feedback |
| `POST /documents` | `/candidate/profile` → upload (valida MIME e 5 MB antes de enviar) |
| `GET /documents/me` | lista de documentos do candidato e seletor de currículo na candidatura |
| `GET /documents/:id` | **Baixar currículo** (blob autenticado → save dialog) |
| `GET /users` · `GET /users/:id` | `/admin/users` (filtros role/companyId/isActive + paginação) |
| `PATCH /users/:id/deactivate` / `reactivate` | `/admin/users` (desativar a própria conta vem bloqueado) |
| `PATCH /users/:id/company` | `/admin/users` → **Empresa** (só recrutador; `null` desvincula) |
| `PATCH /users/:id/role` | `/admin/users` → **Papel** |
| `GET /roles` · `GET /roles/:id` | `/admin/roles` |
| `PUT /roles/:id/permissions` | `/admin/roles` (matriz por recurso, salva o conjunto completo) |

---

## 6. Erros do backend → UI

`src/app/core/api-error.ts` traduz `reason` + status em texto pt-BR (14 testes
cobrem o mapa). Regras de produto respeitadas:

| Situação | Comportamento na UI |
|---|---|
| `409 candidatura_duplicada` | "Você já se candidatou a esta vaga." — e a tela recarrega o estado real, trocando o botão pelo atalho da candidatura |
| `404` (recurso/fora de escopo) | "Não encontrado" / "Vaga não encontrada" — **nunca** "sem permissão" (o backend usa 404 como anti-enumeração) |
| `400 cep_nao_encontrado` | "CEP não encontrado, verifique e tente novamente." + **bloqueio do envio** (o backend rejeitaria) |
| `502 servico_cep_indisponivel` | "Não foi possível confirmar o endereço agora — você pode continuar, o endereço fica em branco." + **não bloqueia** |
| `403 permission_denied` | não deveria acontecer: menus/botões/rotas seguem o RBAC; se acontecer, mensagem neutra |
| `401` | refresh automático no interceptor; se falhar, login com aviso de sessão expirada |
| `400` de validação de DTO | lista os erros campo a campo (`fieldErrors`) abaixo do alerta |
| `409` de negócio (`job_not_fully_filled`, `no_vacancies_left`, `vacancies_below_filled_count`, `application_ja_encerrada`, `application_status_changed_concurrently`, `cnpj_duplicado`, `company_already_inactive/active`, `usuario_nao_e_recrutador`, `recrutador_com_vagas_ativas`, `last_active_admin`, `sem_papel_com_role_manage`, `concorrencia_transacao`) | mensagem específica; os casos de concorrência explicam que basta tentar de novo |
| `status 0` (rede/CORS/API parada) | orienta verificar o backend em `http://localhost:3000` |

Ações destrutivas (desistir de candidatura, desativar empresa/usuário, cancelar
vaga) passam por diálogo de confirmação explicando a consequência.

---

## 7. Roteiro de demonstração (5 minutos)

Sequência testada de ponta a ponta (e coberta por testes automatizados):

0. **Landing** — `/` mostra a proposta do produto; os CTAs levam a login/cadastro
   e há um caminho público para a vitrine ("Ver vagas abertas").
1. **Candidato** — `/auth/register`: crie uma conta (validação de senha ≥ 8,
   confirmação, 409 se o email já existe). O cadastro já entra logado e leva ao
   perfil: preencha título/resumo/telefone, digite o **CEP** (autopreenche o
   endereço) e **anexe um currículo** (PDF/DOC/DOCX até 5 MB).
2. `/jobs` → abra uma vaga → **Candidatar-se** (carta + currículo anexado).
   Em `/candidate/applications` veja o badge **Em análise** e a trilha do funil.
3. **Gipperdor** — saia e entre com `recrutador@recrutamento.test`: o painel
   mostra indicadores e a fila de triagem. Abra a candidatura: o cartão mostra a
   *visão de triagem* (nome/título/skills) enquanto está `PENDING`; mova para
   **Em avaliação** e o backend libera perfil completo + download do currículo.
4. Mova para **Entrevista** → **Agendar entrevista** (data/hora → ISO 8601).
   Depois: concluir/reagendar (cria nova entrevista, `201`) e registrar feedback.
5. **Admin** — entre com `admin@recrutamento.test`: `/admin/companies/new` crie
   uma empresa com **CEP** (endereço resolvido pelo backend). Em
   `/admin/users` vincule um recrutador a ela e troque papéis; em
   `/admin/roles` ajuste permissões (efeito imediato, sem novo login).

O painel lateral com **contas do seed** existe, mas vem **desligado por padrão**
(`demoAccounts: []`): expor emails/senhas numa tela de login é vazamento de
informação. Para uma demo controlada, preencha `environment.local.ts` (arquivo
ignorado pelo git) e o painel volta.

---

## 8. Decisões de arquitetura (e limitações honestas do contrato)

1. **Detalhe público de vaga.** `GET /jobs/:id` exige JWT + `job:read`; a única
   rota pública é `GET /jobs`. Logo, um visitante deslogado resolve a vaga pela
   listagem pública (com paginação de até 100 por página). Consequência: vaga que
   não seja `OPEN` (ou de empresa desativada) não é visível publicamente — e a
   tela responde "Vaga não encontrada", coerente com o backend.
2. **Não existe `GET /companies`.** A lista de empresas do ADMIN é montada por
   *descoberta de ids* a partir de `GET /jobs/mine` (ADMIN vê todas) e
   `GET /users` (`companyId`), seguida de `GET /companies/:id` para cada id.
   Empresa sem vagas e sem recrutadores vinculados não aparece na lista (pode ser
   aberta por `/admin/companies/<id>/edit`). A limitação está escrita na tela.
3. **Não existe `GET /permissions`.** O catálogo editável em `/admin/roles` é a
   união das permissões que já aparecem nos papéis carregados (as 28 do seed).
4. **`companyId` do recrutador não vem no login.** O payload é
   `{id, name, email, role}`. O id da empresa é descoberto na primeira leitura de
   `GET /jobs/mine` e mantido em cache na sessão; recrutador sem vínculo recebe
   `404` e vê um estado vazio explicando que precisa ser vinculado por um ADMIN.
5. **Permissões no cliente são derivadas do papel** (mesma distribuição do seed).
   Se um ADMIN mudar as permissões em runtime, o backend passa a valer na hora e
   a UI se ajusta no próximo login; enquanto isso, qualquer divergência aparece
   como erro traduzido (nunca como tela quebrada).
6. **Download de documento** exige os dois headers, então não é um `<a href>`:
   baixa o blob autenticado e dispara o *save dialog* no cliente.
7. **CEP nunca é enviado como endereço.** Os formulários mandam só `cep`;
   `street/city/state` são resolvidos e gravados pelo backend. Enviar esses
   campos causaria `400` (`forbidNonWhitelisted`).
8. **Corpos de request são enxutos**: campo opcional vazio não é enviado (nem
   como `null`), para não esbarrar em `whitelist`/`forbidNonWhitelisted` nem em
   `@Matches` de campos opcionais.
9. **Ordenação**: o backend expõe `?sortOrder=asc|desc` (campo fixo por
   listagem). A vitrine usa isso como "Mais recentes / Mais antigas".
10. **Busca de vagas** é server-side (`?search`); o filtro "somente remotas" é
    declarado na UI como filtro da página atual, porque o backend não expõe
    `isRemote` como query param.

---

## 9. Testes

`npm test` → **131 testes** em 9 arquivos:

| Arquivo | O que protege |
|---|---|
| `core/api-error.spec.ts` (14) | o mapa completo `reason`/status → texto, incluindo 404 ≠ "sem permissão" e os 3 desfechos do CEP |
| `core/auth/interceptors.spec.ts` (11) | `x-api-key` em toda rota da API, Bearer só onde faz sentido, 401 → refresh → retry, single-flight do refresh, refresh inválido → logout + `/auth/login?expired=1`, API key inválida não derruba sessão |
| `core/guards/auth.guards.spec.ts` (15) | `authGuard`/`roleGuard`/`permissionGuard`/`guestGuard`, `returnUrl` anti open-redirect, home por papel e o espelho do RBAC (8/13/24 keys) |
| `core/services/services.spec.ts` (26) | contrato HTTP de cada service: método, URL, query string, corpo exato (nada de campo extra), multipart, blob, tabelas de transição |
| `features/auth/pages/auth-flow.spec.ts` (9) | login/cadastro reais: validação de cliente, corpo enviado, 401, 409, 400 com `fieldErrors`, redirect por papel |
| `features/jobs/pages/candidate-flow.spec.ts` (10) | **fluxo 1 da demo**: vitrine pública, busca, estado vazio, API fora do ar, detalhe (com fallback público), 404, candidatura com carta+currículo, 409 duplicada, "já candidatei", visão do recrutador na mesma vaga |
| `features/recruiter/pages/recruiter-flow.spec.ts` (19) | **fluxo 2 da demo**: botões = transições válidas, PATCH de status com motivo, 409 `no_vacancies_left`/concorrência, agendar entrevista (ISO 8601), 409 fora do estágio, reagendar (`RESCHEDULED` → 201), download de currículo, payload reduzido, 404 anti-enumeração, recrutador sem empresa, publicar vaga, 409 `job_not_fully_filled` |
| `features/admin/pages/admin-flow.spec.ts` (22) | **fluxo 3 da demo**: máscara/consulta de CEP, CEP válido/inexistente/provedor fora do ar, `POST /companies` sem `street/city/state`, `addressWarning` persistente, 409 CNPJ duplicado, edição via PATCH, descoberta da lista de empresas, desativar/reativar, `last_active_admin`, vínculo de empresa, troca de papel + `recrutador_com_vagas_ativas`, matriz de permissões (`PUT` com conjunto completo), `sem_papel_com_role_manage`, `concorrencia_transacao` |

Os testes usam `HttpTestingController` — **nenhum dado é mockado na tela**: os
`flush()` reproduzem os envelopes reais do backend (`{data, page, limit, total}`,
payload completo × reduzido, `addressWarning`, códigos `reason`).

---

## 10. Build e publicação

```bash
npm run build      # dist/recrutamento-web/browser  (initial 310 kB / 87 kB gzip)
```

A saída é um site estático. Como o roteamento é client-side, **o servidor precisa
de SPA fallback** (qualquer rota desconhecida devolve `index.html`):

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

```bash
# alternativa local para conferir o build de produção
npx serve -s dist/recrutamento-web/browser
```

Antes de publicar, ajuste `src/environments/environment.production.ts`
(`apiUrl`, `apiKey`, `demoAccounts: []`) e garanta que o backend tenha
`CORS_ORIGIN` incluindo a origem do site. Verificado localmente: rotas profundas
(`/jobs`, `/admin/companies`, `/recruiter/jobs/7`) servem o `index.html`, e os
assets hashados saem com o MIME correto.

---

## 11. O que ficou para a próxima versão

Priorizado como "camada final" no briefing — nada aqui bloqueia o fluxo real:

- **Excluir/substituir documento**: intencionalmente **fora do front** — o
  backend não tem rota de exclusão/substituição, e o princípio deste projeto é
  que o front só oferece operações que a API possui. Se a rota nascer
  (`DELETE /documents/:id`, permission `document:delete:own`, escopo
  `ownerId === @CurrentUser().id`, `SetNull` em `Application.resumeDocumentId`,
  que o schema já prevê), a tela de documentos é o lugar natural para o botão.
- Testes de componente para `/candidate/profile` (upload de documento) e
  `/candidate/applications/:id` (desistência) — o contrato HTTP deles já está
  coberto em `services.spec.ts`.
- Tema escuro e refinamento visual fino (hoje o tema claro é consistente).
- Debounce de digitação na busca da vitrine (hoje a busca é explícita: Enter ou
  botão — comportamento previsível em apresentação).
- Notificações/tempo real (ex.: polling de novas candidaturas no painel).
- i18n (todo o texto está em pt-BR, centralizado em `core/format.ts` e
  `core/api-error.ts`, então extrair para `@angular/localize` é direto).
- E2E com Playwright contra o backend real em Docker (hoje a verificação
  ponta-a-ponta é feita pelos testes de componente com HTTP mockado).

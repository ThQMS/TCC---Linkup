# Testes — LinkUp

Suíte de testes profissionais cobrindo as regras de negócio críticas da plataforma.

---

## Stack

| Ferramenta | Versão | Função |
|---|---|---|
| [Jest](https://jestjs.io) | 29.x | Framework de testes |
| [Supertest](https://github.com/ladjs/supertest) | 7.x | Testes de integração HTTP |
| [SQLite (sqlite3)](https://github.com/TryGhost/node-sqlite3) | 5.x | Banco em memória (substitui PostgreSQL nos testes) |

---

## Executar

```bash
npm test              # todos os testes, uma vez
npm run test:watch    # modo interativo (re-executa ao salvar)
npm run test:coverage # com relatório de cobertura de código
```

Saída esperada:

```
Test Suites: 7 passed, 7 total
Tests:       106 passed, 106 total
Time:        ~5s
```

---

## Arquitetura dos Testes

### Por que SQLite em memória?

O banco de produção é PostgreSQL. Nos testes, o Sequelize é redirecionado para SQLite via `moduleNameMapper` no `jest.config.js`:

```js
moduleNameMapper: {
  'config/connection': '<rootDir>/tests/__mocks__/connection.js'
}
```

Qualquer `require('../../src/config/connection')` dentro dos models retorna automaticamente a instância SQLite, sem alterar uma linha do código de produção.

Isso garante:
- Testes determinísticos (banco isolado por worker Jest)
- Velocidade (sem I/O de rede)
- Independência de ambiente (sem PostgreSQL local necessário)

### Mocks de dependências externas

Cada test file mocka explicitamente os helpers externos no topo do arquivo (antes de qualquer `require` dos módulos testados):

| Helper | O que é mockado | Motivo |
|---|---|---|
| `src/helpers/mailer` | `sendMail` | Evita chamadas SMTP reais |
| `src/helpers/socket` | função default | Evita dependência de `io`/WebSocket |
| `src/helpers/aiService` | `chatComplete` | Evita chamadas Groq/LLM reais |
| `src/helpers/pdfService` | `generatePdf` | Evita geração de PDF nos testes |

### Eliminando o delay do sendBulkClosingFeedback

O `sendBulkClosingFeedback` tem um throttle de 600ms entre candidatos (`setTimeout(r, 600)`). `jest.useFakeTimers()` causa deadlock com o I/O nativo do SQLite (as queries Sequelize nunca resolvem). A solução é sobrescrever `global.setTimeout` apenas na chamada específica, tornando o delay 0ms:

```js
async function runBulkFeedback(jobArg) {
  const realSetTimeout = global.setTimeout;
  // Elimina delay artificial; preserva natureza assíncrona
  global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);
  try {
    await sendBulkClosingFeedback(jobArg);
  } finally {
    global.setTimeout = realSetTimeout; // restaura antes do flush
  }
  // 25ms reais (com o timer real): garante que fire-and-forgets internos
  // (_sendRejectionFeedback: 2 queries SQLite + mocks) completem
  await new Promise(r => realSetTimeout(r, 25));
}
```

**Por que não `jest.useFakeTimers`?** Porque o SQLite usa libuv internamente (I/O nativo). Faking timers interfere na ordem do event loop e cria deadlock: o `runAllTimersAsync()` espera a Promise que espera o timer que espera o `runAllTimersAsync()`.

### Fire-and-forget

`_sendRejectionFeedback` e `_scoreOpenAnswers` são disparados sem `await`. O helper `runBulkFeedback` usa 25ms de espera real (com o `realSetTimeout` capturado antes do override) para garantir que esses processos em background completem antes das asserções. Operações SQLite in-memory tipicamente completam em < 5ms.

---

## Estrutura de Arquivos

```
tests/
├── jest.config.js           # Configuração Jest
├── setup.js                 # process.env (NODE_ENV=test, GMAIL_USER, BASE_URL)
│
├── __mocks__/
│   └── connection.js        # Sequelize SQLite :memory: — substitui PostgreSQL
│
├── helpers/
│   ├── db.js                # useDatabase() — beforeAll/afterEach/afterAll
│   └── factories.js         # createCandidate/Company/Job/Resume/Application
│
├── unit/
│   ├── applicationService.test.js       # Ciclo de vida de candidaturas
│   ├── ghostJobCleanup.test.js          # Regra dos 21 dias (anti ghost job)
│   ├── talentRediscoveryService.test.js # Redescoberta de talentos (empresa)
│   ├── revisitOpportunities.test.js     # Oportunidades revisitadas (candidato)
│   ├── similarCandidates.test.js        # Candidatos sugeridos/similares
│   └── availabilityService.test.js      # Sistema de 4 status de disponibilidade
│
└── integration/
    └── jobs.routes.test.js             # POST /jobs/apply/:id (stack completa)
```

---

## Cobertura por Suite

### `applicationService.test.js` — 23 testes

Cobre `applyToJob`, `updateApplicationStatus`, `updateApplicationStage` e `sendBulkClosingFeedback`.

| Cenário | Verificação |
|---|---|
| Candidatura criada | `Application` no banco com `status: 'pendente'` |
| Notificação para empresa | `Notification` criada para `job.UserId` |
| E-mail enviado | `mailer.sendMail` chamado com `to: job.email` |
| PDF em anexo | `attachments[0].contentType === 'application/pdf'` |
| Falha de PDF | Candidatura criada mesmo sem PDF |
| Retorno `emailError` | `null` no sucesso, `Error` na falha |
| Aprovação | Notificação `type: 'success'` para candidato |
| Rejeição | Notificação `type: 'danger'` + feedback IA disparado |
| Contratação | Notificação de parabéns |
| Socket notificado | `sendSocket` chamado em toda mudança de status |
| `em análise` sem notificação | Apenas aprovado/rejeitado/contratado notificam |
| Histórico de etapas | `stageHistory` acumula corretamente com timestamps |
| Bulk feedback com timer fake | `status: 'expirado'` sem esperar 600ms reais |
| Contratado preservado | `status: 'contratado'` não é sobrescrito pelo bulk |

### `ghostJobCleanup.test.js` — 9 testes

Regra: vaga aberta sem atividade há mais de 21 dias → encerrar automaticamente.

| Cenário | Verificação |
|---|---|
| 22 dias de inatividade | Vaga detectada como ghost |
| 20 dias de inatividade | Vaga NÃO detectada |
| Vaga recém-criada | Nunca detectada |
| Status encerrada/pausada | Excluídas da detecção |
| Encerramento | `status: 'encerrada'` no banco |
| Candidaturas pendentes | Marcadas como `expirado` |
| Candidato contratado | Preservado |
| E-mail de feedback | `chatComplete` + `mailer.sendMail` chamados |
| Múltiplas vagas ghost | Todas encerradas; vaga recente intocada |

> **Nota técnica:** a detecção usa `updatedAt` da vaga como proxy de "última atividade". Uma implementação mais robusta verificaria também a data da última movimentação de candidatura.

### `talentRediscoveryService.test.js` — 17 testes

Cobre `calcFitScore`, `findTalentsForJob` e `reactivateContact`.

| Cenário | Verificação |
|---|---|
| `calcFitScore` sem currículo | Retorna `0` |
| Skills idênticas à vaga | Retorna `100` |
| Fit parcial | Valor entre 0 e 100 |
| Keywords ≤ 2 chars | Ignoradas (ruído) |
| Experiências contribuem | Score > 0 mesmo sem skills |
| Sem candidaturas anteriores | `findTalentsForJob` retorna `[]` |
| Fit < 88% | Candidato ignorado |
| Fit ≥ 88% | Candidato incluído no resultado |
| `not_available` | Excluído mesmo com alto fit |
| Persistência | `job.rediscoveryData` atualizado |
| Ordenação | Resultado do maior para o menor fit |
| Permissão | Empresa sem ownership → erro |
| `reactivateContact` | Notificação criada + e-mail enviado |

### `revisitOpportunities.test.js` — 9 testes

Cobre `notifyRevisitedOpportunities` — Feature 2 de redescoberta (perspectiva do candidato).

| Cenário | Verificação |
|---|---|
| Sem histórico de vagas | Noop silencioso, sem notificação |
| Com histórico, sem candidatos | Noop silencioso |
| Fit ≥ 88% + disponível | Notificação `type: 'info'` + e-mail |
| `not_available` | Ignorado |
| Fit < 88% | Ignorado |
| Falha de e-mail | Não propaga exceção (`.catch()` interno) |
| Sem currículo | Fit = 0 → não notifica |

### `similarCandidates.test.js` — 15 testes

Cobre `findSuggestedCandidates` e `contactSuggestedCandidate`.

| Cenário | Verificação |
|---|---|
| Empresa sem ownership | Retorna `[]` |
| Vaga inexistente | Retorna `[]` |
| Já candidatou | Excluído dos sugeridos |
| `not_available` | Excluído |
| Sem currículo | Excluído |
| `combinedScore < 50` | Excluído |
| `MAX_RESULTS` | No máximo 3 resultados |
| Campos retornados | `candidate`, `fitScore`, `skillSimilarity`, `combinedScore`, `commonSkills` |
| Permissão `contactSuggested` | Empresa sem ownership → erro |
| Notificação `similar_invite` | Criada com link correto |
| E-mail ao candidato | `mailer.sendMail` chamado |
| Socket emitido | `sendSocket` chamado com título correto |
| Convite duplicado | Bloqueado sem criar nova notificação |
| Falha de e-mail | `ok: true` (`.catch()` interno) |

### `availabilityService.test.js` — 17 testes

Cobre `isAvailable`, `setAvailability`, `checkAndUpdateAvailability` e `getAvailableCandidateIds` — o núcleo do sistema de disponibilidade de candidatos.

| Cenário | Verificação |
|---|---|
| `actively_searching` | `isAvailable()` retorna `true` |
| `open_to_opportunities` | `isAvailable()` retorna `true` |
| `in_selection_process` | `isAvailable()` retorna `true` (ainda contactável) |
| `not_available` | `isAvailable()` retorna `false` |
| `AVAILABLE_STATUSES` | Contém exatamente 3 status (não inclui `not_available`) |
| Atualizar para disponível | `openToWork` sincronizado para `true` |
| Atualizar para `not_available` | `openToWork` sincronizado para `false` |
| Todos os status disponíveis | Todos sincronizam `openToWork=true` |
| Status inválido | Lança erro; banco não é alterado |
| Usuário inexistente | `checkAndUpdateAvailability` retorna `changed: false` |
| Empresa | Nunca sofre alteração automática de status |
| Regra: aprovado em candidatura | Notificação criada; status NÃO muda automaticamente |
| Regra: inativo 60+ dias (`actively_searching`) | Downgrade para `open_to_opportunities` |
| Regra: inativo mas já em baixa prioridade | Sem downgrade duplo |
| Candidatura recente protege contra downgrade | Status preservado com atividade nos últimos 30 dias |
| `getAvailableCandidateIds` | Inclui os 3 disponíveis; exclui `not_available` e não verificados |
| Pool vazio | Retorna `[]` quando nenhum candidato está disponível |

> **Nota de design:** `checkAndUpdateAvailability` (Regra 1) cria uma notificação *sugestiva* ao candidato aprovado — não força `not_available` automaticamente. Isso respeita a autonomia do candidato, que pode estar participando de múltiplos processos.

### `jobs.routes.test.js` — 16 testes

Teste de integração real: route → middleware auth → controller → service → SQLite.

O app Express é montado sem `app.js` (que inicializa cron jobs). Apenas o router de jobs é montado, com um middleware que injeta `req.user` simulando autenticação.

| Cenário | Verificação |
|---|---|
| Candidatura bem-sucedida | Status 302, `location: /jobs/view/:id` |
| Application no banco | `status: 'pendente'` |
| Notificação para empresa | `Notification` criada |
| E-mail enviado | `mailer.sendMail` chamado |
| Sem currículo | Redirect de erro, sem Application |
| Candidatura duplicada | Bloqueada; count permanece 1 |
| Vaga encerrada | Bloqueada; sem Application |
| Empresa candidatando | Bloqueada; sem Application |
| Falha de SMTP | Application criada mesmo assim |
| Sem autenticação | Redirect para `/login` |

---

## Padrões e Convenções

### Setup de banco por suite

Toda test file chama `useDatabase()` no escopo raiz:

```js
const { useDatabase } = require('../helpers/db');
useDatabase(); // registra beforeAll / afterEach / afterAll
```

Isso garante que cada suite cria suas tabelas, limpa os dados após cada teste e fecha a conexão ao final.

### Factories

Use as factories de `tests/helpers/factories.js` para criar dados. Elas geram e-mails únicos automaticamente:

```js
const company   = await createCompany();
const candidate = await createCandidate({ availabilityStatus: 'open_to_opportunities' });
const job       = await createJob(company.id, { requirements: 'node javascript' });
const resume    = await createResume(candidate.id, { skills: JSON.stringify(['node', 'javascript']) });
```

### Isolamento de mocks

Mocks são declarados no topo de cada test file com `jest.mock()` (hoisted pelo Jest). O `jest.clearAllMocks()` é chamado no `beforeEach` de cada describe que usa mocks, garantindo que contagens e implementações não vazem entre testes.

### Adicionando novos testes

1. Crie o arquivo em `tests/unit/` ou `tests/integration/`
2. Declare os mocks necessários no topo (antes dos imports dos módulos testados)
3. Chame `useDatabase()` se o teste acessa o banco
4. Use as factories para criar dados
5. Se o código testado usa `setTimeout`, ative `jest.useFakeTimers()` no `beforeEach`

---

## Limitações conhecidas

| Limitação | Impacto | Mitigação |
|---|---|---|
| SQLite vs PostgreSQL | Algumas queries com `LIKE`, `GROUP BY`, `jsonb` podem se comportar diferente | Testes de integração com PostgreSQL real antes de deploy |
| Ghost job usa `updatedAt` como proxy | Na prática, a última atividade real pode ser uma movimentação de candidatura | Adicionar campo `lastActivityAt` ao modelo `Job` em v1.1 |
| `_sendRejectionFeedback` fire-and-forget | Requer double flush de microtask nos testes | Já tratado nos helpers `runBulkFeedback`/`runCleanup` |

---

## Cobertura de código

```bash
npm run test:coverage
```

Metas mínimas configuradas em `tests/jest.config.js`:

| Métrica | Meta |
|---|---|
| Branches | 60% |
| Functions | 70% |
| Lines | 70% |
| Statements | 70% |

A cobertura é coletada apenas de `src/services/**/*.js` — o núcleo das regras de negócio.

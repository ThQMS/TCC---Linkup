# Princípios de Engenharia — LinkUp

Este documento descreve os padrões, convenções e decisões de design que guiam o desenvolvimento do LinkUp. Não é um guia de estilo — é o racional por trás das escolhas que tornam o código previsível, extensível e seguro.

---

## 1. Separação de Responsabilidades

O princípio mais crítico da base de código. Cada camada tem uma única razão para mudar:

| Camada | Responsabilidade única | O que NÃO pertence aqui |
|---|---|---|
| `routes/` | Declarar endpoints e aplicar middleware | Qualquer lógica de negócio |
| `controllers/` | Orquestrar req/res | Queries diretas ao banco, regras de negócio complexas |
| `services/` | Lógica de negócio | Manipulação de `req`/`res`, render de templates |
| `helpers/` | Encapsular dependência externa | Lógica de domínio |
| `models/` | Definição de dados e relacionamentos | Qualquer lógica além de scopes e validações simples |

**Por que isso importa:** quando `talentRediscoveryService.js` precisa ser chamado tanto por uma rota HTTP quanto por um cron job, ele funciona sem modificação porque não depende de `req` ou `res`. A fronteira da camada é o que permite reutilização.

---

## 2. Controllers Thin

Controllers devem ser tão finos quanto possível. A regra prática: se um método de controller tem mais de ~30 linhas, provavelmente há lógica que pertence a um service.

**Padrão de controller correto:**
```javascript
async function apply(req, res) {
    try {
        const { id: jobId } = req.params;
        const userId = req.user.id;

        const result = await applicationService.applyToJob(userId, jobId, req.body.answers);

        req.flash('success_msg', 'Candidatura enviada com sucesso.');
        res.redirect('/jobs/my-applications');
    } catch (err) {
        logger.error('jobsController', 'Erro ao candidatar', { err: err.message });
        req.flash('error_msg', err.message || 'Erro ao processar candidatura.');
        res.redirect(`/jobs/view/${req.params.id}`);
    }
}
```

O controller não sabe nada sobre como uma candidatura é criada, validada ou notificada — ele apenas delega e responde.

---

## 3. Padrão de Camada de Service

Services encapsulam fluxos de negócio que envolvem múltiplas operações. Um service pode:
- Fazer múltiplas queries ao banco
- Chamar outros services
- Chamar helpers externos (IA, e-mail, socket)
- Lançar erros com mensagens de negócio claras

Um service **não pode**:
- Usar `req`, `res` ou qualquer abstração HTTP
- Renderizar templates
- Chamar diretamente outro controller

**Exemplo — `applicationService.applyToJob`:**
```javascript
async function applyToJob(userId, jobId, answers) {
    // 1. Validações de negócio
    const resume = await Resume.findOne({ where: { userId } });
    if (!resume) throw new Error('Você precisa ter um currículo para se candidatar.');

    const duplicate = await Application.findOne({ where: { userId, jobId } });
    if (duplicate) throw new Error('Você já se candidatou a esta vaga.');

    // 2. Operações de domínio
    const application = await Application.create({ userId, jobId, answers, status: 'pendente' });

    // 3. Efeitos colaterais (notificações, e-mails)
    await mailer.sendApplicationNotification(job, candidate);
    sendSocket(app, job.UserId, { title: 'Nova candidatura', ... });

    return application;
}
```

Cada responsabilidade é explícita e sequencial. Falha em qualquer etapa lança uma exceção que o controller captura e traduz em mensagem flash.

---

## 4. Encapsulamento de Dependências Externas

Nenhuma camada acima de `helpers/` importa SDKs externos diretamente. Toda integração externa tem um helper dedicado:

```
Groq SDK        → src/helpers/aiService.js     (único ponto de entrada para IA)
Nodemailer      → src/helpers/mailer.js         (único ponto de envio de e-mail)
html-pdf-node   → src/helpers/pdfService.js     (único ponto de geração de PDF)
Socket.io emit  → src/helpers/socket.js         (único ponto de emissão de eventos)
Python :5001    → src/helpers/jobSearch.js       (único ponto de busca semântica)
```

**Benefício direto:** trocar de provedor de IA (Groq → OpenAI) requer mudar apenas `aiService.js` e `groq.js`. Zero mudança nos controllers, services ou templates.

---

## 5. Programação Defensiva

### Falha segura em integrações externas
Serviços externos falham. O código deve sempre ter um comportamento definido quando isso acontece:

```javascript
// jobSearch.js — fallback para SQL se Python indisponível
async function semanticSearch(query, jobs) {
    try {
        const res = await fetch(`${SEARCH_URL}/search`, {
            method: 'POST',
            body: JSON.stringify({ query, jobs }),
            signal: AbortSignal.timeout(4000)   // timeout explícito
        });
        return await res.json();
    } catch {
        return null;   // controller trata null como "usar fallback SQL"
    }
}
```

```javascript
// aiLog.js — falha silenciosa para não bloquear features principais
async function logAi(userId, feature, startTime, success) {
    try {
        await AiLog.create({ userId, feature, durationMs: Date.now() - startTime, success });
    } catch { /* falha silenciosa */ }
}
```

### Validação apenas nas fronteiras do sistema
Validação de entrada acontece uma vez — na camada de middleware, antes de qualquer controller. Services confiam nos dados que recebem porque já foram validados. Não há checagens redundantes de `if (!req.body.email)` espalhadas pelo código.

Fronteiras onde validação ocorre:
- `src/middleware/Validation.js` — todas as entradas do usuário via HTTP
- `src/middleware/validateCompany.js` — CNPJ e domínio de e-mail no registro
- `src/services/applicationService.js` — validações de regra de negócio (currículo obrigatório, sem duplicata)

---

## 6. Tratamento de Erros Consistente

### Em controllers
```javascript
try {
    // lógica delegada
} catch (err) {
    logger.error('contextName', 'Descrição legível', { err: err.message, userId });
    req.flash('error_msg', err.message || 'Mensagem genérica segura para o usuário.');
    res.redirect('/rota-segura');
}
```

### Em endpoints JSON (AJAX)
```javascript
try {
    const result = await service.doSomething();
    res.json({ ok: true, data: result });
} catch (err) {
    logger.error('contextName', 'Descrição', { err: err.message });
    res.status(500).json({ error: 'Mensagem genérica — nunca expor stack trace.' });
}
```

### O que nunca fazer
- Expor stack traces ou mensagens de erro internas para o usuário
- Deixar promises não tratadas (cada `async` tem seu `try/catch`)
- Retornar códigos 200 com erros embutidos no corpo JSON

---

## 7. Segurança por Padrão

Decisões de segurança são arquiteturais, não retroativas.

**CSRF em todo formulário:** o token é injetado via `globalLocals.js` em 100% das respostas — o desenvolvedor não precisa lembrar de adicionar. O middleware `csrf-csrf` rejeita automaticamente qualquer POST sem token válido.

**Sanitização global de entrada:** `sanitizeInputs` middleware remove HTML de todos os campos antes de qualquer controller ver os dados. Não há `strip_tags` espalhado pelo código — acontece uma vez, na camada correta.

**`userId` nunca vem do cliente:** em todas as operações autenticadas, `userId` é extraído de `req.user.id` (sessão validada pelo servidor). Nenhum endpoint aceita `userId` como parâmetro de requisição — isso eliminaria a classe inteira de ataques de falsificação de identidade.

**Autorização por ownership na camada de service:**
```javascript
// talentRediscoveryService.js — sempre verifica propriedade
if (job.UserId !== companyUserId) return { ok: false, error: 'Sem permissão.' };
```

A verificação de ownership não é responsabilidade do controller — ela está no service, onde a lógica de negócio reside, garantindo que seja checada independentemente de como o service é chamado.

---

## 8. Logging Estruturado

O logger (`src/helpers/logger.js`) produz JSON estruturado com contexto, nível, mensagem e dados adicionais:

```javascript
logger.error('aiMetrics', 'Erro ao carregar métricas', { err: err.message, userId });
logger.info('talentRediscovery', 'Talentos notificados', { jobId, count: notified });
logger.warn('similarCandidates', 'Python indisponível, usando fallback', { jobId });
```

**Por que JSON estruturado:** facilita agregação em ferramentas de observabilidade (Datadog, CloudWatch, Loki). `grep` em produção em strings de log não escala — queries por campo sim.

**O que logar:** erros com contexto suficiente para reproduzir o problema, eventos de negócio importantes (contratação, notificação disparada), comportamentos de fallback. Não logar dados sensíveis (senhas, tokens, PII).

---

## 9. Gerenciamento de Dependências Externas

### Singleton pattern para clientes
Clientes de serviços externos são inicializados uma vez e reutilizados:

```javascript
// src/helpers/groq.js
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
module.exports = groq;
```

Isso evita a overhead de autenticação e handshake TCP em cada requisição.

### Variáveis de ambiente validadas no startup
`src/config/startup.js` valida todas as variáveis de ambiente obrigatórias antes da aplicação subir. Se `GROQ_API_KEY` não está definida, a aplicação falha imediatamente com uma mensagem clara — não falha silenciosamente na primeira requisição de IA.

### Timeout explícito em chamadas externas
Toda chamada HTTP externa tem timeout configurado. Sem timeout, uma dependência lenta pode segurar conexões indefinidamente.

---

## 10. Convenções de Código

### Nomenclatura
- Controllers: `[domínio]Controller.js` — `jobsController.js`, `authController.js`
- Services: `[domínio]Service.js` — `applicationService.js`, `talentRediscoveryService.js`
- Rotas: `[domínio].js` dentro de `routes/` — `jobs.js`, `auth.js`
- Modelos: PascalCase — `AiLog.js`, `Job.js`, `Application.js`

### Async/await em vez de callbacks
Todo código assíncrono usa `async/await`. Sem `.then().catch()` encadeados — isso torna o fluxo de controle difícil de seguir e o tratamento de erros inconsistente.

### Desestruturação para clareza
```javascript
// Prefira:
const { id: jobId } = req.params;
const { userId } = req.user;

// Em vez de:
const jobId = req.params.id;
const userId = req.user.userId;
```

### Constantes no topo de módulos
Valores de configuração e thresholds ficam no topo do arquivo, nomeados explicitamente:

```javascript
// talentRediscoveryService.js
const FIT_THRESHOLD         = 88;
const LOOKBACK_MONTHS       = 6;
const MAX_CANDIDATES_NOTIFY = 50;
```

Isso torna as decisões de negócio visíveis e fáceis de ajustar sem buscar números mágicos espalhados pelo código.

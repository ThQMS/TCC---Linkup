# Referência da API — LinkUp

O LinkUp expõe uma API HTTP server-rendered. Endpoints de dados e IA retornam JSON; envios de formulário retornam redirecionamentos com mensagens flash.

**URL Base:** `http://localhost:3000` (desenvolvimento)

**Autenticação:** baseada em sessão via Passport.js. Endpoints protegidos exigem cookie de sessão válido.

**CSRF:** todas as requisições `POST`/`DELETE` devem incluir o token `_csrf` (campo de formulário) ou o header `X-CSRF-Token` (AJAX). O token é injetado em cada página via middleware `globalLocals`. Em caso de token inválido ou expirado: requisições AJAX recebem `HTTP 403` com `{ "error": "Token de segurança expirado. Recarregue a página." }`; envios de formulário recebem redirect com flash `error_msg`.

---

## Autenticação — `/auth`

### POST /auth/login
Autentica um usuário.

**Body (form-encoded)**
```
email     string  obrigatório
password  string  obrigatório
_csrf     string  obrigatório
```

**Respostas**
```
302  →  /              Autenticado com sucesso
302  →  /auth/login    Credenciais inválidas (flash: error_msg)
302  →  /auth/verify   Conta ainda não verificada
429                    Rate limit excedido (10 tentativas / 15 min)
```

---

### POST /auth/register
Cria uma nova conta de usuário.

**Body (form-encoded)**
```
name      string  obrigatório
email     string  obrigatório
password  string  obrigatório  mínimo 6 caracteres
userType  string  obrigatório  "candidato" | "empresa"
cnpj      string  condicional  obrigatório quando userType=empresa
_csrf     string  obrigatório
```

**Respostas**
```
302  →  /auth/verify    Conta criada, e-mail de verificação enviado
302  →  /auth/register  Erro de validação (flash: error_msg)
422                     Falha de validação (JSON se AJAX)
429                     Rate limit excedido (5 registros / hora)
```

---

### POST /auth/verify
Envia o código de verificação de e-mail.

**Body (form-encoded)**
```
code   string  obrigatório  código de 6 dígitos
_csrf  string  obrigatório
```

**Respostas**
```
302  →  /             Verificado com sucesso
302  →  /auth/verify  Código inválido ou expirado
```

---

### POST /auth/forgot-password
Inicia a recuperação de senha.

**Body (form-encoded)**
```
email  string  obrigatório
_csrf  string  obrigatório
```

**Respostas**
```
302  →  /auth/forgot-password  E-mail enviado (ou silencioso se não encontrado — previne enumeração)
429                             Rate limit excedido (5 / 15 min)
```

---

### POST /auth/reset-password
Conclui a redefinição de senha.

**Body (form-encoded)**
```
token     string  obrigatório  do link enviado por e-mail
password  string  obrigatório  mínimo 6 caracteres
_csrf     string  obrigatório
```

**Respostas**
```
302  →  /auth/login          Senha atualizada
302  →  /auth/reset-password Token inválido ou expirado
```

---

### GET /auth/logout
Destrói a sessão.

**Respostas**
```
302  →  /auth/login
```

---

## Vagas — `/jobs`

### GET /jobs/view/:id
Página de detalhes da vaga (pública).

**Parâmetros**
```
id  integer  obrigatório  ID da vaga
```

**Respostas**
```
200  HTML página de detalhes
404  Vaga não encontrada
```

---

### POST /jobs/add
Cria uma nova publicação de vaga. Exige conta empresa.

**Body (form-encoded)**
```
title         string   obrigatório
company       string   obrigatório
description   text     obrigatório
requirements  text     opcional
benefits      text     opcional
differential  text     opcional
salary        string   opcional
modality      string   obrigatório  "presencial" | "hibrido" | "homeoffice"
contractType  string   obrigatório  "clt" | "pj" | "estagio" | "temporario" | "freelancer"
city          string   opcional
isPcd         boolean  opcional     marca a vaga como inclusiva para PCD
stages        string   opcional     array JSON com nomes das etapas
questions     string   opcional     array JSON com perguntas de triagem
_csrf         string   obrigatório
```

**Respostas**
```
302  →  /jobs/view/:id  Vaga criada
302  →  /jobs/add       Erro de validação
```

---

### POST /jobs/update
Atualiza uma vaga existente. Exige ser o dono da vaga.

**Body (form-encoded)**
Mesmos campos do `/jobs/add`, mais:
```
id     integer  obrigatório  ID da vaga
_csrf  string   obrigatório
```

**Respostas**
```
302  →  /jobs/view/:id  Atualizado
302  →  /jobs/edit/:id  Erro de validação ou sem autorização
```

---

### POST /jobs/apply/:id
Envia uma candidatura. Exige conta candidato.

**Parâmetros**
```
id  integer  obrigatório  ID da vaga
```

**Body (form-encoded)**
```
answers  JSON    opcional  array de respostas às perguntas de triagem
_csrf    string  obrigatório
```

**Respostas**
```
302  →  /jobs/view/:id  Candidatura enviada
302  →  /jobs/view/:id  Já candidatado (flash: error_msg)
```

---

### POST /jobs/applications/status
Atualiza o status de uma candidatura. Exige conta empresa e propriedade da vaga.

**Body (form-encoded)**
```
applicationId  integer  obrigatório
jobId          integer  obrigatório
status         string   obrigatório  "aprovado" | "rejeitado" | "contratado"
_csrf          string   obrigatório
```

**Respostas**
```
302  →  /jobs/applications/:jobId  Atualizado
302  →  /jobs/applications/:jobId  Sem autorização ou não encontrado
```

---

### POST /jobs/applications/stage
Move uma candidatura para uma etapa específica do pipeline.

**Body (form-encoded)**
```
applicationId  integer  obrigatório
jobId          integer  obrigatório
stageName      string   obrigatório
_csrf          string   obrigatório
```

**Respostas**
```
302  →  /jobs/applications/:jobId  Etapa atualizada, candidato notificado
```

---

### POST /jobs/close/:id
Encerra uma vaga. Envia feedback gerado por IA a todos os candidatos não contratados.

**Parâmetros**
```
id  integer  obrigatório  ID da vaga
```

**Body (form-encoded)**
```
_csrf  string  obrigatório
```

**Respostas**
```
302  →  /profile  Vaga encerrada, e-mails disparados
302  →  /profile  Sem autorização
```

---

### POST /jobs/ai/rank/:jobId
Ranqueamento por IA de todos os candidatos de uma vaga. Retorna JSON.

**Parâmetros**
```
jobId  integer  obrigatório
```

**Headers**
```
X-CSRF-Token  string  obrigatório
Content-Type  application/json
```

**Resposta 200**
```json
{
  "rankings": [
    {
      "applicationId": 42,
      "score": 87,
      "analysis": "O candidato demonstra forte alinhamento com..."
    }
  ]
}
```

**Respostas**
```
200  Array JSON de rankings
400  { "error": "Nenhum candidato encontrado" }
429  Rate limit de IA excedido (10 req / min)
500  { "error": "Serviço de IA indisponível" }
```

---

### POST /jobs/compare-candidates
Comparação lado a lado de 2 a 3 candidatos por IA. Na UI, candidatos são selecionados via checkboxes customizados (dark theme); o modal de resultado exibe cards escuros individuais por candidato com score, análise, pontos fortes, lacunas e recomendação. Seleção de até 3 candidatos; o botão "Comparar" só aparece com 2 ou 3 selecionados.

**Headers**
```
X-CSRF-Token  string  obrigatório
Content-Type  application/json
```

**Body (JSON)**
```json
{
  "applicationIds": [42, 43],
  "jobId": 7
}
```

**Resposta 200**
```json
{
  "candidates": [
    {
      "nome": "Jane Doe",
      "score": 84,
      "analise": "Fortes habilidades de backend...",
      "pontos_fortes": ["Node.js", "PostgreSQL"],
      "lacunas": ["Docker"],
      "recomendado": true
    }
  ],
  "conclusao": "Jane é a candidata mais forte porque..."
}
```

---

### GET /jobs/similar-candidates/:id
Retorna candidatos da plataforma com perfil similar ao candidato da candidatura informada, que **ainda não aplicaram** à mesma vaga. Exige conta empresa e propriedade da vaga.

**Parâmetros**
```
id  integer  obrigatório  ID da candidatura de referência
```

**Resposta 200**
```json
{
  "similar": [
    {
      "candidate": { "id": 22, "name": "João Silva", "city": "São Paulo" },
      "fitScore": 73,
      "similarity": 61,
      "combinedScore": 67,
      "commonSkills": ["React", "TypeScript"]
    }
  ]
}
```

Campos da resposta:
```
fitScore      integer  Compatibilidade do candidato externo com os requisitos da vaga (0-100)
similarity    integer  Índice Jaccard entre as skills do candidato de referência e do externo (0-100)
combinedScore integer  fitScore × 0.5 + similarity × 0.5 — usado para ordenação e threshold mínimo (≥ 20)
commonSkills  array    Até 5 skills em comum com o candidato de referência
```

---

### GET /jobs/suggested-candidates/:jobId
Retorna candidatos que ainda não se candidataram mas correspondem ao perfil da vaga.

**Resposta 200**
```json
{
  "suggested": [
    {
      "candidate": { "id": 12, "name": "Ana Costa", "city": "Campinas" },
      "fitScore": 68,
      "skillSimilarity": 54,
      "combinedScore": 62,
      "commonSkills": ["Python", "FastAPI"]
    }
  ]
}
```

---

### POST /jobs/contact-suggested/:jobId/:candidateId
Convida um candidato sugerido. Envia notificação no app + e-mail.

**Parâmetros**
```
jobId        integer  obrigatório
candidateId  integer  obrigatório
```

**Headers**
```
X-CSRF-Token  string  obrigatório
```

**Resposta 200**
```json
{ "ok": true }
```

**Resposta 400**
```json
{ "ok": false, "error": "Candidato já foi convidado para esta vaga." }
```

---

### GET /jobs/talents/:jobId
Retorna resultados de redescoberta de talentos para uma vaga (candidatos previamente correspondidos).

**Resposta 200**
```json
{
  "talents": [
    {
      "candidate": { "id": 7, "name": "Carlos Lima" },
      "fitScore": 91,
      "lastApplicationDate": "2025-11-10T14:30:00.000Z"
    }
  ]
}
```

---

## Currículo — `/resume`

### POST /resume/save
Salva ou atualiza o currículo do candidato.

**Body (form-encoded)**
```
summary      text    opcional
skills       JSON    opcional  array de strings de habilidades
experiences  JSON    opcional  array de {role, company, startDate, endDate, description}
education    JSON    opcional  array de {course, institution, startDate, endDate}
phone        string  opcional
city         string  opcional
linkedin     string  opcional
github       string  opcional
_csrf        string  obrigatório
```

**Respostas**
```
302  →  /resume/view  Salvo
422                   Erro de validação
```

---

### POST /resume/ai/improve
Reescrita e melhoria do currículo por IA. Retorna JSON.

**Headers**
```
X-CSRF-Token  string  obrigatório
Content-Type  application/json
```

**Resposta 200**
```json
{
  "improved": {
    "summary": "Engenheiro backend orientado a resultados com 4 anos...",
    "suggestions": ["Quantifique impacto nas descrições de experiência", "Adicione TypeScript às habilidades"]
  }
}
```

---

### POST /resume/ai/import
Extrai dados do currículo de um PDF enviado.

**Body (multipart/form-data)**
```
resume  file    obrigatório  arquivo PDF
_csrf   string  obrigatório
```

**Respostas**
```
302  →  /resume/create  Parseado e pré-preenchido
302  →  /resume/create  Falha no parsing (flash: error_msg)
429                     Rate limit de upload (3 / min)
```

---

## Features de IA

Todos os endpoints de IA exigem `ensureAuthenticated` e têm rate limit de 10 req/min por IP via `aiLimiter`.

### POST /tailoring/:jobId
Gera sugestões de tailoring de currículo para uma vaga específica.

**Resposta 200**
```json
{
  "suggestions": "Para melhorar seu fit para esta vaga, considere destacar sua experiência com...",
  "missingSkills": ["Kubernetes", "Terraform"]
}
```

---

### POST /bias/audit
Analisa uma descrição de vaga em busca de linguagem tendenciosa ou excludente.

**Body (JSON)**
```json
{
  "description": "Buscamos um jovem e dinâmico desenvolvedor..."
}
```

**Resposta 200**
```json
{
  "hasBias": true,
  "issues": [
    { "phrase": "jovem", "reason": "Linguagem baseada em idade pode violar princípios de igualdade de oportunidades" }
  ],
  "rewritten": "Buscamos um desenvolvedor energético e orientado a resultados..."
}
```

---

### POST /interview/:jobId/start
Inicia uma sessão de entrevista simulada para uma vaga específica.

**Resposta 200**
```json
{
  "sessionId": "abc123",
  "questions": [
    "Descreva uma decisão desafiadora de arquitetura backend que você tomou.",
    "Como você aborda otimização de banco de dados sob carga?"
  ]
}
```

---

### POST /interview/:jobId/answer
Envia uma resposta à pergunta atual da entrevista.

**Body (JSON)**
```json
{
  "sessionId": "abc123",
  "questionIndex": 0,
  "answer": "No meu último projeto, eu..."
}
```

**Resposta 200**
```json
{
  "feedback": "Boa estrutura. Considere mencionar métricas específicas.",
  "nextQuestion": 1
}
```

---

### POST /jobs/:id/chat
Envia uma mensagem para o chat IA de uma vaga específica.

**Body (JSON)**
```json
{
  "message": "Qual stack tecnológico essa vaga usa?",
  "history": []
}
```

**Resposta 200**
```json
{
  "reply": "Com base na descrição da vaga, o papel foca em Node.js e PostgreSQL..."
}
```

---

## Perfil e Dashboard — `/profile`

### GET /profile/dashboard
Retorna o dashboard de analytics do usuário autenticado (HTML).

Renderiza métricas de candidato ou empresa dependendo do `userType`.

---

### GET /profile/dashboard/pdf
Exporta o dashboard como PDF para download.

**Resposta**
```
200  Content-Type: application/pdf
```

---

## Métricas de IA — `/ai-metrics`

### GET /ai-metrics
Retorna o dashboard de analytics de uso de IA (HTML) com:
- Total de chamadas, taxa de sucesso, latência média
- Detalhamento por feature
- Gráfico de volume 30 dias
- Card de capacidade Groq (uso RPM + diário, gráfico 7 dias)
- Alerta flash se consumo diário ≥ 80%

---

## Resumo de Códigos HTTP

| Código | Significado |
|---|---|
| `200` | OK — requisição processada com sucesso |
| `302` | Redirecionamento — envio de formulário processado |
| `400` | Bad request — dados ausentes ou inválidos |
| `401` | Não autenticado |
| `403` | Proibido — autenticado mas sem autorização |
| `404` | Não encontrado |
| `422` | Entidade não processável — falha de validação |
| `429` | Muitas requisições — rate limit atingido |
| `500` | Erro interno do servidor |

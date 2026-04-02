# Regras de Negócio — LinkUp

Este documento especifica as regras que governam o comportamento do sistema. Cada regra é identificada por código único, contém uma descrição objetiva, a justificativa da decisão e o impacto técnico no código.

---

## Sumário

1. [Autenticação e Verificação](#1-autenticação-e-verificação)
2. [Perfis de Usuário](#2-perfis-de-usuário)
3. [Vagas](#3-vagas)
4. [Pipeline de Etapas](#4-pipeline-de-etapas)
5. [Candidaturas](#5-candidaturas)
6. [Recursos de IA](#6-recursos-de-ia)
7. [Onboarding](#7-onboarding)
8. [Métricas e Observabilidade](#8-métricas-e-observabilidade)
9. [Notificações](#9-notificações)
10. [Buscas e Recomendações](#10-buscas-e-recomendações)
11. [Segurança e Moderação](#11-segurança-e-moderação)

---

## Convenção de Notação

Cada regra segue o formato:

> **RN-XXX — Título**
> **Descrição:** O que a regra estabelece.
> **Justificativa:** Por que a regra existe.
> **Impacto:** Onde e como afeta o sistema.

---

## 1. Autenticação e Verificação

---

**RN-101 — Registro requer e-mail único**
**Descrição:** Não é possível registrar dois usuários com o mesmo endereço de e-mail, independentemente do tipo de conta (candidato ou empresa).
**Justificativa:** Garante identidade única na plataforma e evita conflitos de sessão.
**Impacto:** `authController.register` retorna erro genérico sem revelar se o e-mail já existe (prevenção de enumeração).

---

**RN-102 — Verificação de e-mail obrigatória**
**Descrição:** Após o registro, o usuário recebe um código de 6 dígitos por e-mail. O acesso ao sistema é bloqueado até que o código seja validado com sucesso.
**Justificativa:** Garante a validade do endereço de e-mail e reduz contas falsas.
**Impacto:** Middleware `auth.js` (`ensureAuthenticated`) redireciona usuários não verificados para `/verify`. O código expira conforme `verificationExpiresAt`.

---

**RN-103 — Reenvio de código com rate limiting**
**Descrição:** O reenvio do código de verificação é limitado pelo `verifyLimiter`. O sistema verifica se o código anterior ainda é válido antes de gerar um novo.
**Justificativa:** Previne abuso de envio de e-mails e consumo desnecessário do serviço SMTP.
**Impacto:** `POST /resend-code` aplica `verifyLimiter` antes de acionar `mailer.js`.

---

**RN-104 — Recuperação de senha via token de uso único**
**Descrição:** O fluxo de recuperação de senha gera um token criptograficamente seguro enviado por e-mail. O token é válido por tempo limitado e invalidado imediatamente após o uso.
**Justificativa:** Garante que o link de recuperação não possa ser reutilizado após a redefinição.
**Impacto:** `POST /reset-password` aplica `resetLimiter`. Token é apagado do banco após uso bem-sucedido.

---

**RN-105 — Proteção contra enumeração de usuários**
**Descrição:** As respostas de `/login` e `/forgot-password` são genéricas e não diferenciam "usuário não encontrado" de "senha incorreta" ou "e-mail não cadastrado".
**Justificativa:** Impede que atacantes descubram quais e-mails estão cadastrados na plataforma.
**Impacto:** Mensagens de erro padronizadas em `authController`.

---

**RN-106 — Rate limiting em endpoints de autenticação**
**Descrição:** Os endpoints `/login`, `/register`, `/verify`, `/resend-code` e `/reset-password` possuem rate limiters independentes com janelas e limites configurados em `Ratelimiter.js`.
**Justificativa:** Mitiga ataques de força bruta e credential stuffing.
**Impacto:** Resposta HTTP 429 com mensagem amigável após exceder o limite.

---

## 2. Perfis de Usuário

---

**RN-201 — Dois tipos de conta: Candidato e Empresa**
**Descrição:** Um usuário é candidato (`userType: 'candidato'`) ou empresa (`userType: 'empresa'`). O tipo é definido no registro e não pode ser alterado posteriormente.
**Justificativa:** As funcionalidades disponíveis diferem fundamentalmente entre os dois perfis. Misturar papéis em uma única conta criaria ambiguidade de experiência e regras de acesso.
**Impacto:** Middleware `ensureCompany` bloqueia candidatos em rotas exclusivas de empresa. Views renderizam conteúdo condicional baseado em `user.userType`.

---

**RN-202 — Validação de elegibilidade de empresa no registro**
**Descrição:** Quando `VALIDATE_COMPANY=true`, o registro como empresa requer que o domínio do e-mail seja corporativo e o CNPJ seja validado pelo middleware `validateCompany`.
**Justificativa:** Impede que candidatos se registrem fraudulentamente como empresas.
**Impacto:** Controlado por variável de ambiente para facilitar o desenvolvimento local.

---

**RN-203 — Status de disponibilidade do candidato (4 níveis)**
**Descrição:** Candidatos definem um dos quatro status de disponibilidade:
- `actively_searching` — Desempregado, buscando ativamente. Prioridade máxima nas buscas. Default para novas contas.
- `open_to_opportunities` — Empregado, mas aberto a propostas (salário, remoto, crescimento). Prioridade média.
- `in_selection_process` — Participando de processos seletivos, ainda pode ser contactado. Prioridade reduzida.
- `not_available` — Não deseja contato. **Excluído** das features de redescoberta e candidatos sugeridos.

Candidatos com `actively_searching`, `open_to_opportunities` ou `in_selection_process` são considerados "disponíveis" (`isAvailable() = true`) e podem aparecer em redescoberta e sugestões. Candidatos com `not_available` são invisíveis para essas features.
**Justificativa:** Quatro status refletem a realidade do mercado de trabalho com mais precisão que um simples toggle on/off, reduzindo ruído para empresas e respeitando a situação atual do candidato.
**Impacto:** `availabilityService.isAvailable()` filtra candidatos antes de redescoberta (`talentRediscoveryService`) e sugestões (`similarCandidatesService`). `setAvailability()` sincroniza o campo legado `openToWork`. Rota `POST /profile/availability-status`. Campo `availabilityStatus` no modelo `User` (migration `20260401000002`).
**Cobertura de testes:** `tests/unit/availabilityService.test.js` — 17 testes validando `isAvailable`, `setAvailability`, regras automáticas e pool de candidatos.

---

**RN-203-A — Downgrade automático por inatividade**
**Descrição:** Candidatos com status `actively_searching` que não apresentam atividade (candidatura, atualização de currículo ou login) nos últimos 30 dias são automaticamente rebaixados para `open_to_opportunities` após 60 dias de inatividade total. Candidatos já em `open_to_opportunities` ou inferior não sofrem novo downgrade.
**Justificativa:** Evita que o topo da lista de busca seja ocupado por candidatos que pararam de usar a plataforma, reduzindo ruído para recrutadores.
**Impacto:** `availabilityService.checkAndUpdateAvailability()` → `_hasRecentActivity()`. Executado pelo cron de disponibilidade em background.

---

**RN-203-B — Sugestão de indisponibilidade após aprovação**
**Descrição:** Quando um candidato é aprovado em uma candidatura, o sistema cria uma notificação sugestiva perguntando se ele deseja atualizar seu status para `not_available`. O status **não é alterado automaticamente** — a decisão final é do candidato.
**Justificativa:** Respeita a autonomia do candidato, que pode estar em múltiplos processos seletivos simultâneos. Forçar `not_available` seria invasivo e potencialmente incorreto.
**Impacto:** `availabilityService._notifySuggestUnavailable()` cria `Notification` com link para `/profile#availability`. Socket.io emite evento se o candidato estiver online.

---

**RN-204 — Bloqueio de empresa por candidato**
**Descrição:** Um candidato pode bloquear uma empresa específica. Vagas da empresa bloqueada não aparecem nos resultados de busca nem nas sugestões do candidato.
**Justificativa:** Respeita a autonomia do candidato em situações de assédio, má experiência prévia ou conflito com empregador atual.
**Impacto:** `POST /jobs/block-company/:companyId` cria registro em `UserBlocks`. Queries de busca excluem vagas de empresas bloqueadas para o usuário autenticado.

---

**RN-205 — Avatar com validação de tipo e tamanho**
**Descrição:** Upload de avatar aceita apenas arquivos JPEG, PNG ou WEBP com tamanho máximo de 3MB.
**Justificativa:** Limita consumo de armazenamento e previne upload de arquivos maliciosos via falsificação de extensão.
**Impacto:** Middleware Multer em `routes/profile.js` valida MIME type e extensão. Upload armazenado em memória e processado antes da persistência.

---

**RN-206 — Selo Empresa Responsiva**
**Descrição:** Empresas que atualizam consistentemente o status das candidaturas dentro de um prazo razoável recebem o Selo Empresa Responsiva, exibido no perfil público da empresa e na listagem de vagas.
**Justificativa:** Incentiva o comportamento responsivo das empresas e ajuda candidatos a priorizar processos seletivos com mais chances de retorno.
**Impacto:** `responsividadeService` calcula a pontuação de responsividade com base na taxa e velocidade de atualização de status. O selo é exibido condicionalmente nos templates de vaga e perfil de empresa.

---

## 3. Vagas

---

**RN-301 — Somente empresas verificadas podem publicar vagas**
**Descrição:** A criação e edição de vagas requer que o usuário seja do tipo empresa e esteja verificado (`isVerified: true`).
**Justificativa:** Garante que apenas entidades legítimas publiquem oportunidades na plataforma.
**Impacto:** Middleware `ensureAuthenticated` + `ensureCompany` em `GET /jobs/add` e `POST /jobs/add`.

---

**RN-302 — Tipo de contrato opcional**
**Descrição:** A empresa pode especificar o tipo de contrato da vaga (CLT, PJ, Estágio, Temporário, Freelancer). O campo `contractType` é opcional — vagas sem especificação são aceitas e exibidas normalmente.
**Justificativa:** Nem toda vaga possui modalidade de contrato pré-definida no momento da publicação.
**Impacto:** Validação em `validateJob` middleware com `.optional()`. Campo `contractType` no modelo `Job` com `allowNull: true`.

---

**RN-303 — Empresa pode editar apenas suas próprias vagas**
**Descrição:** As rotas de edição verificam se o `userId` da vaga corresponde ao usuário autenticado antes de permitir qualquer alteração.
**Justificativa:** Previne que uma empresa altere vagas de outra.
**Impacto:** `jobsController.showEdit` e `jobsController.update` fazem `findOne({ where: { id, userId } })`.

---

**RN-304 — Encerramento de vaga com feedback por IA**
**Descrição:** Ao encerrar uma vaga via `POST /jobs/close/:id`, o sistema gera um feedback humanizado e individualizado por IA para cada candidato não aprovado. O feedback é enviado por e-mail e como notificação no app.
**Justificativa:** Candidatos frequentemente não recebem nenhum retorno após processos seletivos. Feedback gerado por IA reduz o esforço da empresa sem eliminar a humanização.
**Impacto:** `jobsController.closeJobWithFeedback` itera sobre candidaturas pendentes, chama `aiService.chatComplete()` para cada candidato, cria `Notification` e envia e-mail via `mailer.js`.

---

**RN-305 — Vaga encerrada bloqueia novas candidaturas**
**Descrição:** Uma vaga com `status: 'encerrada'` ou `'expirada'` não aceita novas candidaturas. A tentativa retorna erro.
**Justificativa:** Evita candidaturas em vagas já preenchidas, que seriam ignoradas e gerariam frustração.
**Impacto:** `applicationService.applyToJob` verifica `job.status` antes de prosseguir.

---

**RN-306 — Registro de visualizações por vaga**
**Descrição:** Cada visualização de uma vaga por um usuário autenticado é registrada em `JobViews`. Visualizações do próprio dono da vaga não são contabilizadas.
**Justificativa:** Fornece dado analítico real para a empresa avaliar o alcance da vaga sem inflação por auto-visualização.
**Impacto:** `jobsController.view` cria registro em `JobViews`. `JobViewCleanupJob` remove registros com mais de 90 dias todo domingo às 04h.

---

**RN-307 — Sinalização de vaga PCD**
**Descrição:** A empresa pode marcar uma vaga como exclusiva ou prioritária para Pessoas com Deficiência (PCD) via toggle no formulário. O campo `isPcd` é persistido como booleano e exibido como badge na listagem e na página de detalhes da vaga.
**Justificativa:** Atende à legislação brasileira de cotas (Lei 8.213/91) e melhora a experiência do candidato PCD, que pode identificar visualmente vagas adequadas.
**Impacto:** Campo `isPcd` (BOOLEAN, default `false`) no modelo `Job`. `jobsController.create` e `jobsController.update` lêem `req.body.isPcd === 'on'`. Badge renderizado condicionalmente em `index.handlebars` e `view.handlebars`.

---

## 4. Pipeline de Etapas

---

**RN-401 — Etapas do pipeline são configuráveis por vaga**
**Descrição:** Cada vaga possui um pipeline de etapas independente, armazenado como array JSON na coluna `stages`. As etapas são definidas no momento da criação ou edição da vaga.
**Justificativa:** Processos seletivos variam por área, senioridade e cultura da empresa. Um pipeline fixo não atende a diversidade real do recrutamento.
**Impacto:** `jobs.stages` é um campo `TEXT` (JSON serializado) no PostgreSQL. A UI renderiza as etapas dinamicamente após `JSON.parse`. Sem uso de operadores JSONB nativos — serialização/deserialização feita no código Node.js.

---

**RN-402 — IA sugere etapas com base na área da vaga**
**Descrição:** Durante a criação da vaga, a empresa pode solicitar sugestão automática de etapas. O sistema envia área, título e nível de senioridade ao `aiService` e recebe uma lista de etapas recomendadas para revisão.
**Justificativa:** Reduz o esforço cognitivo da empresa e garante pipelines estruturados, especialmente para equipes sem processo de recrutamento estabelecido.
**Impacto:** Chamada a `aiService.chatComplete()` com prompt especializado. Resultado pré-populado no formulário para revisão antes de salvar.

---

**RN-403 — Movimentação de candidato entre etapas**
**Descrição:** A empresa pode mover um candidato para qualquer etapa do pipeline via `POST /jobs/applications/stage`. A etapa atual é persistida em `Application.currentStage`.
**Justificativa:** Reflete o estado real do processo seletivo e permite rastreamento preciso da jornada de cada candidato.
**Impacto:** `jobsController.updateStage` atualiza `currentStage` e cria notificação automática para o candidato.

---

**RN-404 — Mudança de etapa gera notificação ao candidato**
**Descrição:** Toda movimentação de etapa notifica o candidato em tempo real via Socket.io e persiste uma notificação em `Notifications`.
**Justificativa:** Mantém o candidato informado sem exigir que ele consulte ativamente a plataforma.
**Impacto:** `socket.emit('notification')` e `Notification.create()` são chamados em sequência por `jobsController.updateStage`.

---

**RN-405 — Métricas de conversão por etapa no dashboard**
**Descrição:** O dashboard da empresa exibe a taxa de conversão entre etapas do pipeline e o tempo médio de permanência em cada etapa.
**Justificativa:** Permite à empresa identificar gargalos no processo seletivo e tomar decisões baseadas em dados.
**Impacto:** `profileController.getDashboard` agrega dados de `Applications` agrupados por `currentStage` e calcula métricas derivadas.

---

## 5. Candidaturas

---

**RN-501 — Currículo é pré-requisito para candidatura**
**Descrição:** Um candidato só pode se candidatar a uma vaga se possuir currículo cadastrado na plataforma (`Resume` associado ao usuário).
**Justificativa:** Sem currículo, a IA não consegue gerar carta de apresentação contextualizada nem calcular score de compatibilidade. Candidaturas sem currículo não agregam valor à empresa.
**Impacto:** `applicationService.applyToJob` verifica existência de `Resume` antes de prosseguir. Candidatos sem currículo são redirecionados para `/resume/create`.

---

**RN-502 — Candidatura duplicada é bloqueada**
**Descrição:** Um candidato não pode se candidatar mais de uma vez à mesma vaga. A tentativa retorna erro.
**Justificativa:** Evita duplicidade de dados e confusão no pipeline da empresa.
**Impacto:** `applicationService.applyToJob` verifica existência de `Application` com mesmo `userId` + `jobId` antes de criar.

---

**RN-503 — Carta de apresentação enviada por e-mail à empresa**
**Descrição:** Ao se candidatar, o candidato pode fornecer uma carta de apresentação. A carta é incluída no e-mail enviado à empresa junto com o PDF do currículo. Não é persistida no banco — existe apenas no e-mail de notificação.
**Justificativa:** Reduz a barreira de entrada para candidatos e entrega à empresa o contexto completo da candidatura diretamente no e-mail.
**Impacto:** `applicationService.applyToJob` recebe `coverLetter` como parâmetro e o embute em `_buildApplicationEmail`.

---

**RN-504 — Score de respostas de triagem calculado automaticamente**
**Descrição:** Quando a vaga possui perguntas abertas, a IA avalia as respostas do candidato após a candidatura de forma assíncrona (fire-and-forget, sem bloquear o fluxo). O score (0–100) e o feedback são persistidos em `Application.answersScore` e `Application.answersFeedback`.
**Justificativa:** Oferece sinal quantitativo para que a empresa priorize a triagem com base na qualidade das respostas, não apenas no currículo.
**Impacto:** `_scoreOpenAnswers` em `applicationService` chama `aiService.chatComplete()` de forma assíncrona. `answersScore` e `answersFeedback` são exibidos na listagem de candidatos da empresa.

---

**RN-505 — Ciclo de vida do status de candidatura**
**Descrição:** O status de uma candidatura assume os valores: `pendente` (padrão ao criar), `em análise`, `aprovado`, `rejeitado`, `contratado`, `expirado` e `cancelado`. A empresa atualiza os status do pipeline; o candidato pode cancelar enquanto `pendente`; o sistema atualiza para `expirado` via cron.
**Justificativa:** Mantém o histórico completo do processo seletivo e permite que ambas as partes acompanhem a jornada em tempo real.
**Impacto:** `applicationService.updateApplicationStatus` persiste status da empresa. `applicationService.cancelApplication` persiste cancelamento pelo candidato (ver RN-508). Mudança para `rejeitado` dispara feedback IA. Mudança para `contratado` dispara e-mail de parabéns.

---

**RN-506 — Expiração automática de candidaturas sem resposta**
**Descrição:** Candidaturas com status `pendente` que não receberam movimentação após N dias são marcadas como `expirado` pelo cron `applicationsExpiryJob`.
**Justificativa:** Mantém o pipeline limpo e evita que candidatos aguardem indefinidamente por respostas de vagas inativas.
**Impacto:** `applicationsExpiryJob` executa diariamente, atualiza `status` e cria notificação para o candidato.

---

**RN-508 — Cancelamento de candidatura pelo candidato**
**Descrição:** O candidato pode cancelar sua própria candidatura desde que o status seja `pendente`. Ao cancelar: (1) o status é atualizado para `cancelado` e `canceledAt` é registrado; (2) uma notificação in-app é criada para o dono da vaga; (3) uma notificação em tempo real é enviada via Socket.io para a empresa; (4) um e-mail transacional é disparado fire-and-forget para o endereço da vaga. Candidaturas com status `cancelado` são excluídas do envio de feedback em massa ao encerrar a vaga.
**Justificativa:** Permite que o candidato retire uma candidatura equivocada ou redundante sem depender da empresa. Notificar a empresa evita que ela invista tempo avaliando um candidato que já desistiu. Registrar `canceledAt` preserva o histórico para métricas futuras.
**Impacto:** `applicationService.cancelApplication` — valida o status, persiste a atualização, cria notificação, chama `sendSocketNotification` e dispara `_sendCancellationEmail`. `applicationService.sendBulkClosingFeedback` exclui `cancelado` do `Op.notIn`. `jobsController.cancelApplication` retorna JSON `{ ok: true }` consumido pelo Alpine.js no frontend. Rota: `POST /jobs/cancel/:applicationId`.

---

**RN-507 — Lembrete enviado antes da expiração**
**Descrição:** Antes de expirar uma candidatura, o sistema verifica se já foi enviado um lembrete (`reminderSent`). Caso não, envia um alerta à empresa solicitando resposta.
**Justificativa:** Dá à empresa uma segunda oportunidade de responder antes que o processo seja encerrado automaticamente.
**Impacto:** `Application.reminderSent` flag controla envio único. E-mail via `mailer.js`.

---

## 6. Recursos de IA

---

**RN-601 — Toda chamada de IA passa por `aiService.chatComplete()`**
**Descrição:** Não há chamadas diretas ao Groq SDK fora de `src/helpers/aiService.js`. Todo consumo de IA passa obrigatoriamente pelo wrapper centralizado.
**Justificativa:** Garante retry exponencial, log automático, cache e substituibilidade do provider de IA em um único ponto.
**Impacto:** Estrutural. Qualquer feature nova de IA deve usar `aiService.chatComplete()`.

---

**RN-602 — Uso de IA é registrado em `AiLogs`**
**Descrição:** Cada chamada ao LLM registra: usuário, feature, duração em ms e resultado (sucesso/falha).
**Justificativa:** Permite auditoria de uso, cálculo de custo estimado por feature, identificação de features mais demandadas e detecção de abuso.
**Impacto:** `aiLog.js` é chamado automaticamente após cada resposta. Dados alimentam o Dashboard de Métricas de IA.

---

**RN-603 — Rate limiting em endpoints de IA**
**Descrição:** Todas as rotas que acionam IA estão sujeitas ao `aiLimiter` (10 requisições/minuto por IP), aplicado globalmente em `routes/index.js`.
**Justificativa:** Protege contra abuso que degradaria a experiência para outros usuários e poderia esgotar o limite diário da API.
**Impacto:** Resposta HTTP 429 ao exceder o limite.

---

**RN-604 — Cache de respostas de IA para prompts idênticos**
**Descrição:** O `aiCache.js` armazena em memória respostas para prompts com conteúdo idêntico por período configurável. Uma nova chamada ao Groq só é feita se não houver cache válido.
**Justificativa:** Reduz latência e consumo de tokens em casos onde o mesmo prompt é executado múltiplas vezes (ex: melhoria de vaga sem alteração de conteúdo).
**Impacto:** Transparente para o usuário. Aplicado na camada de `aiService`.

---

**RN-605 — Retry exponencial em falhas da IA**
**Descrição:** Em caso de erro 429 (rate limit do Groq) ou timeout, `aiService.chatComplete()` tenta novamente até 2 vezes com backoff exponencial.
**Justificativa:** Erros transientes da API externa não devem resultar em falha imediata para o usuário.
**Impacto:** Após as tentativas sem sucesso, a exceção é propagada e o controller exibe mensagem de erro ao usuário.

---

**RN-606 — Bias Auditor analisa exclusivamente a descrição da vaga**
**Descrição:** O Bias Auditor recebe o texto da descrição da vaga e retorna análise de linguagem excludente, tendenciosa ou que possa desencorajar grupos sub-representados.
**Justificativa:** Linguagem não-inclusiva em descrições de vagas reduz a diversidade do pool de candidatos, frequentemente sem intenção consciente da empresa.
**Impacto:** `biasAuditController.audit` chama `aiService.chatComplete()` com prompt especializado. Resultado exibido inline para revisão antes de publicar a vaga.

---

**RN-607 — Tailoring de currículo não altera o currículo salvo**
**Descrição:** O tailoring gera sugestões de adaptação do currículo para uma vaga específica, mas não altera o currículo persistido no banco. O candidato revisa e aplica as sugestões manualmente.
**Justificativa:** O candidato deve ter controle total sobre o conteúdo final do currículo. A IA atua como consultor, não como editor automático.
**Impacto:** `tailoringController.tailor` chama `aiService.chatComplete()` com currículo + vaga. Resultado exibido em página de revisão.

---

**RN-608 — Simulação de entrevista avalia respostas ao final**
**Descrição:** A simulação gera perguntas (início), coleta respostas por pergunta e, ao finalizar, gera avaliação completa com score e feedback por pergunta.
**Justificativa:** Avaliação ao final — não em tempo real — permite que o candidato responda sem pressão imediata de julgamento.
**Impacto:** Três endpoints (`/start`, `/answer`, `/score`) em `interviewController`. Respostas mantidas em sessão durante a simulação.

---

**RN-609 — Ranking de candidatos inclui justificativa textual**
**Descrição:** O ranking gerado pela IA não retorna apenas uma ordenação, mas também uma justificativa textual para cada posição, explicando os critérios considerados.
**Justificativa:** Decisões de RH não podem ser baseadas em scores opacos. A justificativa permite que o recrutador valide ou questione a recomendação da IA.
**Impacto:** Prompt ao `aiService.chatComplete()` exige justificativa estruturada no retorno. Exibida na UI junto ao score de cada candidato.

---

**RN-610 — Algoritmo de fit score usa apenas skills e cargos**
**Descrição:** O `calcFitScore` calcula compatibilidade entre currículo e vaga usando exclusivamente habilidades (`skills`) e títulos de cargo das experiências (`role`). Nomes de empresa, nomes de instituição de ensino e texto do sumário são excluídos do cálculo. O texto da vaga considerado é título, requisitos e descrição — benefícios e diferenciais são excluídos.
**Justificativa:** Incluir nomes de empresa/educação gera ruído que infla ou deflate artificialmente o score — um candidato com muitas experiências em empresas com nomes comuns teria denominador grande sem sinal real de fit. Benefícios e diferenciais da vaga não são indicadores de fit técnico.
**Impacto:** `calcFitScore` em `talentRediscoveryService.js`. Usa `Set` para lookup O(1) contra palavras da vaga. Aplicado em todas as features que calculam fit: redescoberta de talentos, candidatos similares e candidatos sugeridos.

---

**RN-611 — Threshold mínimo de exibição de candidatos similares**
**Descrição:** Candidatos similares e candidatos sugeridos só são exibidos se o `fitScore` for ≥ 50% (por candidatura) ou o `combinedScore` for ≥ 50 (sugeridos). A ordenação privilegia `fitScore` com peso 70% e `similarity` com peso 30%.
**Justificativa:** Exibir candidatos com fit abaixo de 50% gera ruído e reduz a confiança do recrutador na feature. O peso maior em `fitScore` garante que o alinhamento com a vaga domine sobre a similaridade entre candidatos.
**Impacto:** `findSimilarCandidates` em `talentRediscoveryService.js` filtra por `fitScore >= 50`. `COMBINED_THRESHOLD = 50` em `similarCandidatesService.js`. Sort: `fitScore * 0.7 + similarity * 0.3`.

---

**RN-612 — Threshold de redescoberta de talentos é 88%**
**Descrição:** A feature de redescoberta de talentos notifica apenas candidatos com `fitScore >= 88%`. Candidatos indisponíveis (`isAvailable = false`) são ignorados independentemente do score.
**Justificativa:** O threshold alto garante que apenas candidatos com alto grau de alinhamento sejam notificados, evitando spam e protegendo a credibilidade da feature.
**Impacto:** `FIT_THRESHOLD = 88` em `talentRediscoveryService.js`. `isAvailable()` checado antes do cálculo de score.

---

## 7. Onboarding

---

**RN-701 — Checklist de onboarding para novos usuários**
**Descrição:** Novos usuários são apresentados a um checklist de onboarding que guia as primeiras ações na plataforma (completar perfil, criar currículo, publicar primeira vaga, etc.).
**Justificativa:** Reduz o tempo até o primeiro valor percebido (time-to-value), especialmente para usuários que não explorariam o sistema por conta própria.
**Impacto:** `onboardingService` gerencia progresso do checklist. `authController.onboardingComplete` marca como concluído.

---

**RN-702 — Checklist pode ser descartado pelo usuário**
**Descrição:** O usuário pode dispensar o checklist permanentemente via `POST /onboarding/checklist/dismiss`. O campo `checklistDismissed` é marcado como `true` e o checklist não é exibido novamente.
**Justificativa:** Usuários experientes ou que completaram as ações fora da ordem sugerida não devem ser incomodados por um checklist irrelevante.
**Impacto:** `authController.dismissChecklist` atualiza `User.checklistDismissed`. Templates verificam o campo antes de renderizar o checklist.

---

**RN-703 — Onboarding é específico por tipo de perfil**
**Descrição:** O checklist de candidatos e o de empresas possuem itens distintos, refletindo as ações relevantes para cada perfil.
**Justificativa:** Mostrar itens irrelevantes (ex: "Publique sua primeira vaga" para um candidato) confunde o usuário e reduz a taxa de conclusão do onboarding.
**Impacto:** `onboardingService` retorna itens filtrados por `user.userType`.

---

## 8. Métricas e Observabilidade

---

**RN-801 — Dashboard de métricas segregado por perfil**
**Descrição:** O dashboard de uma empresa exibe métricas exclusivamente de suas próprias operações. Candidatos têm painel próprio com candidaturas e compatibilidade. Nenhum dado de terceiros é exposto.
**Justificativa:** Dados de outras empresas ou candidatos são confidenciais.
**Impacto:** `profileController.getDashboard` filtra todos os dados por `userId`.

---

**RN-802 — Dashboard de Métricas de IA por usuário**
**Descrição:** O dashboard de IA (`/ai-metrics`) exibe: volume de uso por feature, taxa de sucesso, tempo médio de resposta e gráfico de tendência 30 dias — filtrado pelo uso do próprio usuário autenticado.
**Justificativa:** Transparência sobre o uso de IA permite ao usuário entender como a plataforma está trabalhando para ele e ao desenvolvedor identificar features com baixa adoção.
**Impacto:** `routes/aiMetrics.js` agrega dados de `AiLogs` filtrados por `userId`.

---

**RN-803 — Monitoramento de capacidade da API Groq**
**Descrição:** O dashboard de métricas de IA exibe um card de capacidade da API Groq com: limite de RPM (30 req/min), limite diário (1.000 req/dia), uso no último minuto, uso hoje, requests restantes hoje, percentual de uso diário e gráfico de barras dos últimos 7 dias. Os dados de capacidade são globais (sem filtro por usuário, pois a API é compartilhada). Um alerta flash amarelo é disparado automaticamente quando o uso diário atinge 80%.
**Justificativa:** O plano gratuito do Groq é o principal gargalo operacional da plataforma. Sem visibilidade em tempo real, é impossível gerenciar o limite proativamente.
**Impacto:** `aiMetrics.js` executa `AiLog.count()` (global, sem `userId`) para uso no minuto e no dia, e `AiLog.findAll()` com `GROUP BY DATE(createdAt)` para dados semanais. `req.flash('warning_msg', ...)` disparado ao renderizar se `dailyUsagePct >= 80`. `warning_msg` exposto via `globalLocals.js` e renderizado em `main.handlebars`.

---

**RN-804 — Relatórios exportáveis em PDF**
**Descrição:** O dashboard da empresa e a listagem de candidaturas do candidato podem ser exportados em PDF via endpoints dedicados.
**Justificativa:** Permite que empresas compartilhem relatórios offline e que candidatos tenham registro formal de suas atividades na plataforma.
**Impacto:** `pdfService.js` centraliza a geração. `pdfUtils.js` sanitiza HTML antes de renderizar (prevenção de XSS nos dados do usuário).

---

**RN-805 — Visualizações de vagas expiram após 90 dias**
**Descrição:** Registros de `JobViews` são automaticamente removidos pelo `jobViewCleanupJob` todo domingo às 04h, mantendo apenas os últimos 90 dias.
**Justificativa:** Dados de analytics muito antigos perdem relevância operacional e consomem espaço desnecessariamente.
**Impacto:** Métricas de visualização refletem janela rolante de 90 dias.

---

## 9. Notificações

---

**RN-901 — Notificações persistidas e em tempo real**
**Descrição:** Toda notificação relevante (nova candidatura, mudança de status, mudança de etapa, vaga encerrada, redescoberta de talento) é persistida em `Notifications` e emitida em tempo real via Socket.io para o usuário destinatário.
**Justificativa:** Persistência garante que o usuário veja a notificação mesmo que não esteja online no momento do evento. Socket.io garante feedback imediato quando está conectado.
**Impacto:** `Notification.create()` + `socket.emit('notification')` chamados em conjunto nos eventos relevantes.

---

**RN-902 — Notificações marcadas como lidas ao acessar a tela**
**Descrição:** Ao acessar `/notifications`, todas as notificações não lidas do usuário são marcadas como `read: true` em uma única operação bulk.
**Justificativa:** Simplifica a experiência — o usuário não precisa marcar cada notificação individualmente.
**Impacto:** `Notification.update({ read: true }, { where: { userId, read: false } })` em `routes/notifications.js`.

---

**RN-903 — Alertas de buscas salvas enviados por e-mail**
**Descrição:** Usuários com alertas ativos em buscas salvas recebem e-mail com novas vagas que correspondem aos critérios salvos. O `alertsJob` executa diariamente.
**Justificativa:** Mantém candidatos ativos informados sobre o mercado sem exigir acesso diário à plataforma.
**Impacto:** `alertsJob` compara vagas criadas desde o último alerta com os parâmetros de cada `SavedSearch` com `alertEnabled: true`.

---

**RN-904 — E-mail de encerramento de vaga é individualizado**
**Descrição:** Ao encerrar uma vaga, o e-mail de feedback para cada candidato não aprovado é gerado pela IA com referência explícita à vaga e ao candidato.
**Justificativa:** Feedback genérico tem valor percebido baixo. Feedback contextualizado — mesmo gerado por IA — demonstra respeito pelo tempo do candidato e melhora a imagem da empresa.
**Impacto:** `jobsController.closeJobWithFeedback` itera por candidato, chama IA, gera e-mail personalizado via `mailer.js`.

---

## 10. Buscas e Recomendações

---

**RN-1001 — Busca semântica híbrida via Reciprocal Rank Fusion**
**Descrição:** A busca utiliza três mecanismos combinados: (1) busca semântica via `sentence-transformers` que captura intenção e sinônimos; (2) BM25 keyword-matching que garante precisão em termos técnicos exatos; (3) Reciprocal Rank Fusion (RRF) que combina os dois rankings sem calibração manual de pesos. O embedding de cada vaga pondera título 3×, mais descrição, requisitos, modalidade e cidade. Em caso de indisponibilidade do microserviço Python, o sistema cai graciosamente para busca SQL `ILIKE`.
**Justificativa:** Busca puramente semântica falha em termos técnicos específicos; busca por keywords falha em variações linguísticas. RRF captura ambos os casos sem degradar nenhum deles.
**Impacto:** `python-search/embedder.py` implementa `rank_jobs`. `searchService.js` chama o microserviço e pagina os resultados. Fallback automático para SQL quando Python está offline.

---

**RN-1002 — Sugestões de vagas personalizadas na home**
**Descrição:** A home exibe sugestões de vagas para o candidato autenticado baseadas no conteúdo do currículo. Vagas de empresas bloqueadas e vagas já candidatadas são excluídas.
**Justificativa:** Reduz o esforço de descoberta para o candidato e aumenta a relevância do feed principal.
**Impacto:** `jobSearch.getSuggestedJobs` usa keyword matching ponderado (habilidades 3×, cargos 2×, palavras gerais 1×) contra o currículo. Retorna até 3 sugestões.

---

**RN-1003 — Redescoberta de talentos é proativa e automatizada**
**Descrição:** Ao publicar uma nova vaga, o sistema escaneia candidatos de processos anteriores da empresa (janela de 6 meses) com `fitScore >= 88%` e disponibilidade ativa. O candidato é notificado que seu perfil foi redescoberto. O cron `talentRediscoveryJob` executa periodicamente para vagas recentes.
**Justificativa:** Empresas têm candidatos qualificados no histórico que seriam perfeitos para novas vagas, mas o processo manual de recontato é ineficiente. A automação torna esse processo escalável.
**Impacto:** `talentRediscoveryService.findTalentsForJob` chamado ao criar vaga. `talentRediscoveryJob` executa em background. Resultados persistidos em `job.rediscoveryData`.

---

**RN-1004 — Candidatos similares ao melhor candidato da vaga**
**Descrição:** A empresa pode ver candidatos com perfil similar ao de qualquer candidato já inscrito na vaga. O sistema retorna até 3 perfis com `fitScore >= 50%`, ordenados por `fitScore * 0.7 + similarity * 0.3`.
**Justificativa:** Amplia o pool de candidatos qualificados sem esforço adicional de busca por parte da empresa.
**Impacto:** `GET /jobs/similar-candidates/:id` chama `findSimilarCandidates` em `talentRediscoveryService`. Exibido no card de cada candidatura com botão "Candidatos Similares".

---

**RN-1005 — Candidatos sugeridos que ainda não se candidataram**
**Descrição:** O painel de candidaturas exibe até 3 candidatos que ainda não se candidataram à vaga mas têm `combinedScore >= 50` (combinação de fit com a vaga e similaridade com o perfil médio dos inscritos). Apenas candidatos disponíveis são considerados.
**Justificativa:** Reduz o custo de aquisição de candidatos qualificados para a empresa, que pode convidar diretamente em vez de reanunciar.
**Impacto:** `findSuggestedCandidates` em `similarCandidatesService.js`. Exibido no banner azul no topo da página de candidaturas. Botão "Convidar" envia notificação no app + e-mail ao candidato.

---

**RN-1006 — Oportunidades revisitadas para candidatos**
**Descrição:** Quando uma empresa abre nova vaga compatível com o perfil de um candidato que já se candidatou anteriormente a vagas desta empresa, o sistema notifica o candidato proativamente.
**Justificativa:** Um candidato rejeitado para uma vaga pode ser perfeito para outra abertura da mesma empresa. Esta feature fecha a lacuna entre histórico de interações e oportunidades futuras.
**Impacto:** `notifyRevisitedOpportunities` em `talentRediscoveryService.js` chamado ao criar vaga. Candidato recebe notificação contextualizada referenciando a empresa e a nova vaga.

---

**RN-1007 — Buscas salvas com parâmetros completos**
**Descrição:** Um candidato autenticado pode salvar qualquer busca realizada (query + filtros) para reexecutá-la posteriormente ou ativar alertas automáticos por e-mail.
**Justificativa:** Candidatos em processo ativo de busca realizam as mesmas pesquisas repetidamente. Buscas salvas eliminam esse esforço repetitivo.
**Impacto:** `savedSearchesController.save` persiste `query` e `filters` em `SavedSearch`. `toggleAlert` habilita/desabilita alertas por e-mail para a busca específica.

---

## 11. Segurança e Moderação

---

**RN-1101 — CSRF obrigatório em todos os formulários POST**
**Descrição:** Todo formulário que envia dados via POST deve incluir o token CSRF gerado por `csrf-csrf`. Requisições sem token ou com token inválido são rejeitadas com HTTP 403.
**Justificativa:** Protege contra Cross-Site Request Forgery, onde um site malicioso forjaria ações em nome de um usuário autenticado.
**Impacto:** `csrf-csrf` configurado em `app.js`. Token injetado em `res.locals.csrfToken` via `globalLocals` middleware em 100% das respostas.

---

**RN-1102 — Sanitização global de inputs**
**Descrição:** O middleware `sanitizeInputs` (aplicado globalmente em `app.js`) percorre todos os campos de `req.body` e remove HTML potencialmente malicioso antes que os dados cheguem aos controllers.
**Justificativa:** Prevenção de XSS e injeção de conteúdo em campos de texto livre (descrições, cartas de apresentação, currículos).
**Impacto:** Aplicado antes do roteamento. Dados chegam aos controllers já sanitizados.

---

**RN-1103 — Audit log de ações sensíveis**
**Descrição:** Ações sensíveis (login bem-sucedido, falha de login, alteração de senha, exclusão de vaga) são registradas em log estruturado via `auditLog.js` com contexto completo (userId, IP, timestamp, ação).
**Justificativa:** Permite rastreabilidade de incidentes de segurança e auditoria de conformidade.
**Impacto:** `auditLog` middleware aplicado seletivamente nas rotas relevantes.

---

**RN-1104 — Upload de arquivo restringe tipo e tamanho**
**Descrição:** Todo endpoint de upload valida MIME type e extensão do arquivo independentemente. Limites: 3MB para avatares, 5MB para currículos PDF.
**Justificativa:** Validar apenas a extensão permite bypass via renomeação. Validar apenas MIME type permite bypass via falsificação de cabeçalho. A combinação dos dois é necessária.
**Impacto:** `fileFilter` em `routes/profile.js` e `routes/resume.js` aplica ambas as verificações.

---

**RN-1105 — Arquivos de upload armazenados em memória, não em disco**
**Descrição:** Multer é configurado com `memoryStorage()` em todos os endpoints de upload. Nenhum arquivo é gravado em disco no servidor.
**Justificativa:** Evita acúmulo de arquivos temporários e reduz risco de path traversal ou execução de arquivos enviados. O conteúdo é processado em memória e descartado após uso.
**Impacto:** `req.file.buffer` disponível para processamento. Arquivos não persistem após o ciclo de requisição.

---

**RN-1106 — `userId` nunca vem do cliente**
**Descrição:** Em todas as operações autenticadas, `userId` é extraído de `req.user.id` (sessão validada pelo servidor). Nenhum endpoint aceita `userId` como parâmetro de requisição ou corpo.
**Justificativa:** Aceitar `userId` do cliente eliminaria completamente a autenticação — qualquer usuário poderia agir em nome de outro simplesmente alterando o parâmetro.
**Impacto:** Estrutural. Verificações de ownership nos services usam o `userId` da sessão, nunca do request body.

# Regras de Negócio — LinkUp

**Versão:** 1.1
**Data:** 2026-03-29
**Autor:** Thiago Henrique Queiroz Muniz Silva

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

> **RN-XXX** — Título
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
**Justificativa:** Previne abuso de envio de e-mails e consumo desnecessário do serviço de SMTP.
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
**Justificativa:** Mitiga ataques de força bruta e stuffing de credenciais.
**Impacto:** Resposta HTTP 429 com mensagem amigável após exceder o limite.

---

## 2. Perfis de Usuário

---

**RN-201 — Dois tipos de conta: Candidato e Empresa**
**Descrição:** Um usuário é ou candidato (`userType: 'candidato'`) ou empresa (`userType: 'empresa'`). O tipo é definido no registro e não pode ser alterado posteriormente.
**Justificativa:** As funcionalidades disponíveis diferem fundamentalmente entre os dois perfis. Misturar papéis em uma única conta criaria ambiguidade de experiência e regras de acesso.
**Impacto:** Middleware `ensureCompany` bloqueia candidatos em rotas exclusivas de empresa. Views renderizam conteúdo condicional baseado em `user.userType`.

---

**RN-202 — Validação de elegibilidade de empresa no registro**
**Descrição:** Quando `VALIDATE_COMPANY=true`, o registro como empresa requer que o domínio do e-mail ou outros critérios sejam validados pelo middleware `validateCompany`.
**Justificativa:** Impede que candidatos se registrem fraudulentamente como empresas.
**Impacto:** Controlado por variável de ambiente para facilitar o desenvolvimento local.

---

**RN-203 — Status de disponibilidade do candidato**
**Descrição:** Candidatos podem definir seu status de disponibilidade (ex: "Aberto a oportunidades", "Empregado mas em busca", "Não disponível"). O status é visível para empresas no ranking de candidatos.
**Justificativa:** Proporciona contexto relevante para empresas ao avaliar candidatos e reduz contatos desnecessários.
**Impacto:** `availabilityService` gerencia as transições de status. Campo `availabilityStatus` no modelo `User`.

---

**RN-204 — Bloqueio de empresa por candidato**
**Descrição:** Um candidato pode bloquear uma empresa específica. Vagas da empresa bloqueada não aparecem nos resultados de busca nem nas sugestões do candidato.
**Justificativa:** Respeita a autonomia do candidato em situações de assédio, má experiência prévia ou concorrência de empregador atual.
**Impacto:** `POST /jobs/block-company/:companyId` cria registro em `UserBlocks`. Queries de busca excluem vagas de empresas bloqueadas para o usuário autenticado.

---

**RN-205 — Avatar com validação de tipo e tamanho**
**Descrição:** O upload de avatar aceita apenas arquivos JPEG, PNG ou WEBP com tamanho máximo de 3MB.
**Justificativa:** Limita consumo de armazenamento e previne upload de arquivos maliciosos via falsificação de extensão.
**Impacto:** Middleware Multer em `routes/profile.js` valida MIME type e extensão. Upload armazenado em memória e processado antes da persistência.

---

## 3. Vagas

---

**RN-301 — Somente empresas verificadas podem publicar vagas**
**Descrição:** A criação e edição de vagas requer que o usuário seja do tipo empresa (`isCompany: true`) e esteja verificado (`isVerified: true`).
**Justificativa:** Garante que apenas entidades legítimas publiquem oportunidades na plataforma.
**Impacto:** Middleware `ensureAuthenticated` + `ensureCompany` em `GET /jobs/add` e `POST /jobs/add`.

---

**RN-302 — Tipo de contrato**
**Descrição:** A empresa pode especificar o tipo de contrato da vaga (CLT, PJ, Estágio, Temporário, Freelancer). O campo `contractType` é opcional — vagas sem especificação são aceitas e exibidas normalmente.
**Justificativa:** Informação relevante para que candidatos filtrem oportunidades compatíveis com seu perfil legal e tributário, mas nem toda vaga possui modalidade de contrato pré-definida.
**Impacto:** Validação em `validateJob` middleware com `.optional()`. Campo `contractType` no modelo `Job` com `allowNull: true`. Migration `20260328000001-add-contract-type-to-jobs.js`.

---

**RN-307 — Sinalização de vaga PCD**
**Descrição:** A empresa pode marcar uma vaga como exclusiva ou prioritária para Pessoas com Deficiência (PCD) via toggle no formulário de criação e edição. O campo `isPcd` é persistido como booleano e exibido como badge verde na listagem de vagas e na página de detalhes da vaga.
**Justificativa:** Atende à legislação brasileira de cotas (Lei 8.213/91) e melhora a experiência do candidato PCD, que pode identificar visualmente vagas adequadas sem precisar ler a descrição completa.
**Impacto:** Campo `isPcd` (BOOLEAN, default `false`) no modelo `Job`. Migration `20260329000001-add-is-pcd-to-jobs.js`. `jobsController.create` e `jobsController.update` lêem `req.body.isPcd === 'on'`. Badge renderizado condicionalmente em `index.handlebars` e `view.handlebars`.

---

**RN-303 — Empresa pode editar apenas suas próprias vagas**
**Descrição:** As rotas de edição (`GET /jobs/edit/:id`, `POST /jobs/update`) verificam se o `userId` da vaga corresponde ao usuário autenticado antes de permitir qualquer alteração.
**Justificativa:** Previne que uma empresa altere vagas de outra.
**Impacto:** `jobsController.showEdit` e `jobsController.update` fazem `findOne({ where: { id, userId } })`.

---

**RN-304 — Encerramento de vaga com feedback aos candidatos**
**Descrição:** Ao encerrar uma vaga via `POST /jobs/close/:id`, a empresa pode optar por notificar todos os candidatos que não foram aprovados. A IA gera um feedback humanizado e individualizado para cada candidato.
**Justificativa:** Proporciona experiência digna ao candidato, que frequentemente não recebe nenhum retorno após processo seletivos. Feedback gerado por IA reduz o esforço da empresa sem eliminar a humanização.
**Impacto:** `jobsController.closeJobWithFeedback` itera sobre candidaturas pendentes, chama `aiService.chatComplete()` para gerar feedback contextual, cria `Notification` e envia e-mail via `mailer.js`. Status da vaga é atualizado para `encerrada`.

---

**RN-305 — Vaga encerrada bloqueia novas candidaturas**
**Descrição:** Uma vaga com `status: 'encerrada'` (ou `'expirada'`) não aceita novas candidaturas. A tentativa de aplicação retorna erro.
**Justificativa:** Evita candidaturas em vagas já preenchidas, que seriam ignoradas e gerariam frustração.
**Impacto:** `applicationService.applyToJob` verifica `job.status` antes de prosseguir.

---

**RN-306 — Registro de visualizações por vaga**
**Descrição:** Cada visualização de uma vaga por um usuário autenticado é registrada em `JobViews`. Visualizações do próprio dono da vaga não são contabilizadas.
**Justificativa:** Fornece dado analítico real para a empresa avaliar o alcance da vaga sem inflação por auto-visualização.
**Impacto:** `jobsController.view` cria registro em `JobViews`. `JobViewCleanupJob` remove registros com mais de 90 dias todo domingo às 04h.

---

## 4. Pipeline de Etapas

---

**RN-401 — Etapas do pipeline são configuráveis por vaga**
**Descrição:** Cada vaga possui um pipeline de etapas independente, armazenado como array JSON na coluna `stages`. As etapas são definidas no momento da criação ou edição da vaga.
**Justificativa:** Processos seletivos variam por área, senioridade e cultura da empresa. Um pipeline fixo não atende a diversidade real de recrutamento.
**Impacto:** `jobs.stages` é um campo `TEXT` (JSON serializado como string) no PostgreSQL. A UI renderiza as etapas dinamicamente após `JSON.parse`. Sequelize lê e grava como string — sem uso de operadores JSONB nativos.

---

**RN-402 — IA sugere etapas com base na área da vaga**
**Descrição:** Durante a criação da vaga, a empresa pode solicitar sugestão automática de etapas à IA. O sistema envia área, título e nível de senioridade ao `aiService` e recebe uma lista de etapas recomendadas.
**Justificativa:** Reduz o esforço cognitivo da empresa e garante pipelines estruturados, especialmente para equipes sem processo de recrutamento estabelecido.
**Impacto:** Chamada a `aiService.chatComplete()` com prompt especializado de sugestão de pipeline. Resultado é pré-populado no formulário para revisão antes de salvar.

---

**RN-403 — Movimentação de candidato entre etapas**
**Descrição:** A empresa pode mover um candidato para qualquer etapa do pipeline da vaga via `POST /jobs/applications/stage`. A etapa atual é persistida em `Application.currentStage`.
**Justificativa:** Reflete o estado real do processo seletivo e permite rastreamento preciso da jornada de cada candidato.
**Impacto:** `jobsController.updateStage` atualiza `currentStage` e cria notificação automática para o candidato.

---

**RN-404 — Mudança de etapa gera notificação ao candidato**
**Descrição:** Toda movimentação de etapa notifica o candidato em tempo real via Socket.io e persiste uma notificação em `Notifications`.
**Justificativa:** Mantém o candidato informado sem exigir que ele consulte ativamente a plataforma.
**Impacto:** `socket.emit('notification')` e `Notification.create()` são chamados em sequência por `jobsController.updateStage`.

---

**RN-405 — Métricas de conversão por etapa**
**Descrição:** O dashboard da empresa exibe a taxa de conversão entre etapas do pipeline (candidatos que avançaram / candidatos que entraram na etapa), bem como o tempo médio de permanência em cada etapa.
**Justificativa:** Permite à empresa identificar gargalos no processo seletivo e tomar decisões baseadas em dados.
**Impacto:** `profileController.getDashboard` agrega dados de `Applications` agrupados por `currentStage` e calcula métricas derivadas.

---

## 5. Candidaturas

---

**RN-501 — Currículo é pré-requisito para candidatura**
**Descrição:** Um candidato só pode se candidatar a uma vaga se possuir um currículo cadastrado na plataforma (`Resume` associado ao usuário).
**Justificativa:** Sem currículo, a IA não consegue gerar carta de apresentação contextualizada nem calcular score de compatibilidade. Candidaturas vazias não agregam valor à empresa.
**Impacto:** `applicationService.applyToJob` verifica existência de `Resume` antes de prosseguir. Candidatos sem currículo são redirecionados para `/resume/create`.

---

**RN-502 — Candidatura duplicada é bloqueada**
**Descrição:** Um candidato não pode se candidatar mais de uma vez à mesma vaga. A tentativa retorna erro.
**Justificativa:** Evita duplicidade de dados e confusão no pipeline da empresa.
**Impacto:** `applicationService.applyToJob` verifica existência de `Application` com mesmo `userId` + `jobId` antes de criar.

---

**RN-503 — Carta de apresentação enviada por e-mail à empresa**
**Descrição:** Ao se candidatar, o candidato pode fornecer uma carta de apresentação. A carta é incluída no e-mail enviado à empresa junto com o PDF do currículo. Ela não é persistida no banco de dados — existe apenas no e-mail de notificação.
**Justificativa:** Reduz a barreira de entrada para candidatos e entrega à empresa o contexto completo da candidatura diretamente no e-mail.
**Impacto:** `applicationService.applyToJob` recebe `coverLetter` como parâmetro e o embute em `_buildApplicationEmail`. A candidatura é criada em `Application` apenas com `jobId`, `userId` e `answers`.

---

**RN-504 — Score de respostas abertas calculado automaticamente**
**Descrição:** Quando a vaga possui perguntas abertas ou situacionais, a IA avalia as respostas do candidato após a candidatura (fire-and-forget, sem bloquear o fluxo). O score (0–100) e o feedback são persistidos em `Application.answersScore` e `Application.answersFeedback`.
**Justificativa:** Oferece sinal quantitativo para que a empresa priorize a triagem com base na qualidade das respostas, não apenas no currículo.
**Impacto:** `_scoreOpenAnswers` em `applicationService` chama `aiService.chatComplete()` de forma assíncrona. `answersScore` e `answersFeedback` são exibidos na listagem de candidatos da empresa.

---

**RN-505 — Status de candidatura em português**
**Descrição:** O status de uma candidatura assume os valores: `pendente` (padrão ao criar), `aprovado`, `rejeitado`, `contratado` e `expirado`. A empresa atualiza o status pelo pipeline; o sistema atualiza para `expirado` via cron.
**Justificativa:** Mantém o histórico do processo seletivo e permite que o candidato acompanhe sua jornada em tempo real.
**Impacto:** `applicationService.updateApplicationStatus` persiste o novo status e cria notificação ao candidato. Mudança para `rejeitado` dispara e-mail de feedback via IA. Mudança para `contratado` dispara e-mail de parabéns.

---

**RN-506 — Expiração automática de candidaturas sem resposta**
**Descrição:** Candidaturas com status `pendente` que não receberam nenhuma movimentação após N dias são marcadas como `expirado` pelo cron `applicationsExpiryJob`.
**Justificativa:** Mantém o pipeline limpo e evita que candidatos aguardem indefinidamente por respostas de vagas inativas.
**Impacto:** `applicationsExpiryJob` executa diariamente, atualiza `status` e cria notificação para o candidato informando a expiração.

---

**RN-507 — Lembrete enviado antes da expiração**
**Descrição:** Antes de expirar uma candidatura, o sistema verifica se já foi enviado um lembrete (`reminderSent`). Caso não, envia um alerta à empresa solicitando resposta.
**Justificativa:** Dá à empresa uma segunda oportunidade de responder antes que o processo seja encerrado automaticamente.
**Impacto:** `Application.reminderSent` flag controla envio único. E-mail via `mailer.js`.

---

## 6. Recursos de IA

---

**RN-601 — Toda chamada de IA passa por `aiService.chatComplete()`**
**Descrição:** Não há chamadas diretas ao Groq SDK fora de `src/helpers/aiService.js`. Todo consumo de IA obrigatoriamente passa pelo wrapper centralizado.
**Justificativa:** Garante retry exponencial, log automático, cache e substituibilidade do provider de IA em um único ponto.
**Impacto:** Estrutural. Qualquer feature nova de IA deve usar `aiService.chatComplete()`.

---

**RN-602 — Uso de IA é registrado em `AiLogs`**
**Descrição:** Cada chamada bem-sucedida ao LLM registra: usuário, feature, modelo utilizado, tokens consumidos e timestamp.
**Justificativa:** Permite auditoria de uso, cálculo de custo estimado por feature, identificação de features mais demandadas e detecção de abuso.
**Impacto:** `aiLog.js` é chamado automaticamente por `aiService.chatComplete()` após cada resposta bem-sucedida.

---

**RN-603 — Rate limiting em endpoints de IA**
**Descrição:** Todas as rotas que acionam IA estão sujeitas ao `aiLimiter` (definido em `Ratelimiter.js`), aplicado globalmente no `routes/index.js`.
**Justificativa:** Protege contra abuso que geraria custo excessivo no Groq e degradaria a experiência para outros usuários.
**Impacto:** Resposta HTTP 429 ao exceder limite. Usuário recebe mensagem amigável orientando aguardar.

---

**RN-604 — Cache de respostas de IA para prompts idênticos**
**Descrição:** O `aiCache.js` armazena em memória respostas para prompts com conteúdo idêntico por período configurável. Uma nova chamada ao Groq só é feita se não houver cache válido.
**Justificativa:** Reduz latência e consumo de tokens em casos onde o mesmo prompt é executado múltiplas vezes (ex: melhoria de vaga sem alteração de conteúdo).
**Impacto:** Sem efeito funcional para o usuário. Transparente na camada de `aiService`.

---

**RN-605 — Retry exponencial em falhas da IA**
**Descrição:** Em caso de erro 429 (rate limit do Groq) ou timeout, `aiService.chatComplete()` tenta novamente até 3 vezes com backoff exponencial (1s, 2s, 4s).
**Justificativa:** Erros transientes da API externa não devem resultar em falha imediata para o usuário.
**Impacto:** Aumenta latência máxima em caso de falha. Após 3 tentativas sem sucesso, a exceção é propagada e o controller exibe mensagem de erro ao usuário.

---

**RN-606 — Bias Auditor analisa exclusivamente a descrição da vaga**
**Descrição:** O Bias Auditor recebe o texto da descrição da vaga e retorna uma análise de linguagem excludente, tendenciosa ou que possa desencorajar grupos sub-representados.
**Justificativa:** Linguagem não-inclusiva em descrições de vagas reduz a diversidade do pool de candidatos, frequentemente sem intenção consciente da empresa.
**Impacto:** `biasAuditController.audit` chama `aiService.chatComplete()` com prompt especializado. Resultado exibido inline para revisão antes de publicar a vaga.

---

**RN-607 — Tailoring de currículo é específico por vaga**
**Descrição:** O tailoring gera sugestões de adaptação do currículo do candidato para uma vaga específica. Não altera o currículo salvo — gera apenas uma versão sugerida para revisão.
**Justificativa:** O candidato deve ter controle sobre o conteúdo final do currículo. A IA atua como consultor, não como editor automático.
**Impacto:** `tailoringController.tailor` chama `aiService.chatComplete()` com currículo + vaga. Resultado exibido em modal/página de revisão.

---

**RN-608 — Simulação de entrevista avalia respostas ao final**
**Descrição:** A simulação de entrevista gera perguntas contextuais (início), coleta respostas (resposta por resposta) e, ao finalizar, gera avaliação completa com score e feedback por pergunta.
**Justificativa:** Avaliação ao final — e não em tempo real — permite que o candidato responda sem pressão imediata de julgamento, tornando a simulação mais fidedigna.
**Impacto:** Três endpoints (`/start`, `/answer`, `/score`) em `interviewController`. Respostas mantidas em sessão durante a simulação.

---

**RN-609 — Ranking de candidatos inclui justificativa**
**Descrição:** O ranking de candidatos gerado pela IA não retorna apenas uma ordenação, mas também uma justificativa textual para cada posição, explicando os critérios considerados.
**Justificativa:** Decisões de RH não podem ser baseadas em scores opacos. A justificativa permite que o recrutador valide ou questione a recomendação da IA.
**Impacto:** `aiService.chatComplete()` recebe prompt que exige justificativa estruturada no retorno. Exibida na UI junto ao score de cada candidato.

---

## 7. Onboarding

---

**RN-701 — Checklist de onboarding para novos usuários**
**Descrição:** Novos usuários (candidatos e empresas) são apresentados a um checklist de onboarding que guia as primeiras ações na plataforma (ex: completar perfil, criar currículo, publicar primeira vaga).
**Justificativa:** Reduz o tempo até o primeiro valor percebido (time-to-value), especialmente para usuários que não explorariam o sistema por conta própria.
**Impacto:** `onboardingService` gerencia progresso do checklist. `authController.onboardingComplete` marca o onboarding como concluído.

---

**RN-702 — Checklist pode ser descartado pelo usuário**
**Descrição:** O usuário pode dispensar o checklist permanentemente via `POST /onboarding/checklist/dismiss`. O campo `checklistDismissed` é marcado como `true` e o checklist não é exibido novamente.
**Justificativa:** Usuários experientes ou que completaram as ações fora da ordem sugerida não devem ser incomodados por um checklist irrelevante para eles.
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
**Descrição:** O dashboard de uma empresa exibe métricas de vagas, candidaturas, pipeline e IA exclusivamente de suas próprias operações. Candidatos têm seu próprio painel com candidaturas e compatibilidade.
**Justificativa:** Dados de outras empresas ou candidatos são confidenciais e não devem ser acessíveis entre usuários.
**Impacto:** `profileController.getDashboard` filtra todos os dados por `userId`.

---

**RN-802 — Métricas de IA disponíveis em dashboard dedicado**
**Descrição:** O dashboard de IA (`/ai-metrics`) exibe: volume de uso por feature, features mais utilizadas, modelos acionados e distribuição temporal de chamadas. Acessível a usuários autenticados sobre seu próprio uso.
**Justificativa:** Transparência sobre o uso de IA permite ao usuário entender como a plataforma está trabalhando para ele e ao desenvolvedor identificar features com baixa adoção.
**Impacto:** `routes/aiMetrics.js` agrega dados de `AiLogs` filtrados por `userId`. `FEATURE_LABELS` e `FEATURE_ICONS` proveem contexto visual.

---

**RN-803 — Relatórios exportáveis em PDF**
**Descrição:** O dashboard da empresa e a listagem de candidaturas do candidato podem ser exportados em PDF via endpoints dedicados (`/profile/dashboard/pdf`, `/jobs/my-applications/pdf`).
**Justificativa:** Permite que empresas compartilhem relatórios de processo seletivo offline e que candidatos tenham registro formal de suas atividades na plataforma.
**Impacto:** `pdfService.js` centraliza a geração. `pdfUtils.js` garante sanitização de HTML (prevenção de XSS nos dados do usuário).

---

**RN-804 — Visualizações de vagas expiram após 90 dias**
**Descrição:** Registros de `JobViews` são automaticamente removidos pelo `jobViewCleanupJob` todo domingo às 04h, mantendo apenas os últimos 90 dias.
**Justificativa:** Dados de analytics muito antigos perdem relevância operacional e consomem espaço desnecessariamente no banco de dados.
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
**Descrição:** Usuários que ativaram alertas em buscas salvas recebem e-mail diário com novas vagas que correspondem aos critérios salvos. O `alertsJob` executa diariamente e verifica quais buscas possuem `alertEnabled: true`.
**Justificativa:** Mantém candidatos ativos informados sobre o mercado sem exigir acesso diário à plataforma.
**Impacto:** `alertsJob` compara vagas criadas desde o último alerta com os parâmetros de cada `SavedSearch` ativa.

---

**RN-904 — E-mail de encerramento de vaga é individualizado**
**Descrição:** Ao encerrar uma vaga, a empresa pode enviar feedback individualizado para cada candidato não aprovado. O e-mail é gerado pela IA com tom humanizado e referência explícita à vaga e ao candidato.
**Justificativa:** Feedback genérico tem valor percebido baixo. Feedback contextualizado (mesmo gerado por IA) demonstra respeito pelo tempo do candidato e melhora a imagem da empresa.
**Impacto:** `jobsController.closeJobWithFeedback` itera por candidato, chama IA, gera e-mail personalizado via `mailer.js`.

---

## 10. Buscas e Recomendações

---

**RN-1001 — Busca semântica híbrida (Semântica + BM25 via RRF)**
**Descrição:** A busca de vagas utiliza três mecanismos em camadas: (1) busca semântica via `sentence-transformers` (`paraphrase-multilingual-MiniLM-L12-v2`) que captura intenção e sinônimos; (2) BM25 keyword-matching (`rank-bm25`) que garante precisão em termos técnicos exatos (ex: "React", "Node.js", "CLT"); (3) Reciprocal Rank Fusion (RRF) que combina os dois rankings sem necessidade de calibração manual de pesos. O embedding de cada vaga inclui título (peso 3×), descrição, requisitos, benefícios, diferenciais, modalidade e cidade. Se o microserviço Python estiver indisponível, o sistema cai graciosamente para busca SQL `ILIKE`.
**Justificativa:** Busca puramente semântica falha em termos técnicos específicos; busca puramente por keywords falha em variações linguísticas e sinônimos. A combinação via RRF captura ambos os casos sem degradar nenhum deles.
**Impacto:** `python-search/embedder.py` implementa `rank_jobs` com BM25Okapi + RRF. `searchService.js` chama o microserviço e pagina os resultados semânticos. Degradação graciosa para SQL quando Python está offline.

---

**RN-1002 — Sugestões de vagas personalizadas**
**Descrição:** A home page exibe sugestões de vagas para o candidato autenticado baseadas no conteúdo do currículo e no histórico de buscas. Vagas de empresas bloqueadas são excluídas.
**Justificativa:** Reduz o esforço de descoberta para o candidato e aumenta a relevância do feed principal.
**Impacto:** `jobSearch.getSuggestedJobs` usa keyword matching ponderado (habilidades 3×, títulos de cargo 2×, palavras gerais 1×) contra o conteúdo do currículo; exclui vagas já candidatadas e de empresas bloqueadas. Retorna até 3 sugestões.

---

**RN-1003 — Redescoberta de talentos é proativa e automatizada**
**Descrição:** O sistema identifica diariamente candidatos que participaram de processos anteriores de uma empresa e cujo perfil se encaixa em vagas abertas atualmente. O candidato é notificado que seu perfil foi redescoberto.
**Justificativa:** Empresas frequentemente têm candidatos qualificados em seu histórico que seriam perfeitos para uma nova vaga, mas o processo manual de recontato é ineficiente. A automação com IA torna esse processo escalonável.
**Impacto:** `talentRediscoveryJob` + `talentRediscoveryService` executam análise diária. `Notification` e e-mail são enviados ao candidato. Empresa recebe sugestão no dashboard.

---

**RN-1004 — Candidatos similares ao melhor candidato**
**Descrição:** A empresa pode solicitar candidatos similares ao perfil do candidato mais bem avaliado em uma vaga. O sistema usa `similarCandidatesService` para identificar perfis com características semelhantes.
**Justificativa:** Amplia o pool de candidatos qualificados sem esforço adicional de busca por parte da empresa.
**Impacto:** `GET /jobs/similar-candidates/:id` chama `similarCandidatesService` que analisa habilidades, experiência e score do candidato de referência.

---

**RN-1005 — Oportunidades revisitadas para candidatos**
**Descrição:** Quando uma empresa abre nova vaga compatível com o perfil de um candidato que já se candidatou anteriormente a vagas desta empresa (mesmo sem sucesso), o sistema sugere a nova oportunidade proativamente.
**Justificativa:** Um candidato rejeitado para uma vaga pode ser perfeito para outra abertura da mesma empresa. Essa funcionalidade fecha a lacuna entre o histórico de interações e as oportunidades futuras.
**Impacto:** `availabilityService` e `talentRediscoveryService` identificam esses casos. Candidato recebe notificação contextualizada referenciando a empresa e a nova vaga.

---

**RN-1006 — Buscas podem ser salvas com parâmetros completos**
**Descrição:** Um candidato autenticado pode salvar qualquer busca realizada (query + filtros) para reexecutá-la posteriormente ou ativar alertas automáticos.
**Justificativa:** Candidatos em processo ativo de busca realizam as mesmas pesquisas repetidamente. Buscas salvas eliminam esse esforço repetitivo.
**Impacto:** `savedSearchesController.save` persiste `query` e `filters` em `SavedSearch`. `toggleAlert` habilita/desabilita alertas por e-mail para a busca específica.

---

## 11. Segurança e Moderação

---

**RN-1101 — CSRF obrigatório em todos os formulários POST**
**Descrição:** Todo formulário que envia dados via POST deve incluir o token CSRF gerado por `csrf-csrf`. Requisições sem token ou com token inválido são rejeitadas com HTTP 403 e redirecionamento para `/login`.
**Justificativa:** Protege contra Cross-Site Request Forgery, onde um site malicioso forjaria ações em nome de um usuário autenticado.
**Impacto:** `csrf-csrf` configurado em `app.js`. Token injetado em `res.locals.csrfToken` via `globalLocals` middleware. Tratamento de erro `EBADCSRFTOKEN` no handler global de erros.

---

**RN-1102 — Sanitização global de inputs**
**Descrição:** O middleware `sanitizeInputs` (aplicado globalmente em `app.js`) percorre todos os campos de `req.body` e remove caracteres e padrões potencialmente maliciosos antes que os dados cheguem aos controllers.
**Justificativa:** Prevenção de XSS e injeção de conteúdo em campos de texto livre (descrições, cartas de apresentação, currículos).
**Impacto:** Aplicado antes do roteamento. Dados chegam aos controllers já sanitizados.

---

**RN-1103 — Audit log de ações sensíveis**
**Descrição:** Ações sensíveis (login bem-sucedido, falha de login, alteração de senha, exclusão de vaga) são registradas em log estruturado via `auditLog.js` e `logger.js` com contexto completo (userId, IP, timestamp, ação).
**Justificativa:** Permite rastreabilidade de incidentes de segurança e auditoria de conformidade.
**Impacto:** `auditLog` middleware aplicado seletivamente nas rotas relevantes.

---

**RN-1104 — Upload de arquivo restringe tipo e tamanho**
**Descrição:** Todo endpoint de upload valida MIME type e extensão do arquivo independentemente (sem confiar apenas em um dos dois). Limites de tamanho são aplicados por Multer: 3MB para avatares, 5MB para currículos PDF.
**Justificativa:** Validar apenas a extensão permite bypass via renomeação. Validar apenas MIME type permite bypass via falsificação de cabeçalho. A combinação dos dois é necessária.
**Impacto:** `fileFilter` em `routes/profile.js` e `routes/resume.js` aplica ambas as verificações.

---

**RN-1105 — Arquivos de upload armazenados em memória, não em disco**
**Descrição:** Multer é configurado com `memoryStorage()` em todos os endpoints de upload. Nenhum arquivo é gravado em disco no servidor.
**Justificativa:** Evita acúmulo de arquivos temporários e reduz risco de path traversal ou execução de arquivos enviados. O conteúdo é processado em memória e descartado após uso.
**Impacto:** `req.file.buffer` disponível para processamento. Arquivos não persistem após o ciclo de requisição.

# Guia de Deploy — LinkUp

---

## Pré-requisitos

| Dependência | Versão mínima | Observação |
|---|---|---|
| Node.js | 18.x | 22.x recomendado |
| npm | 9.x | incluído com Node.js |
| PostgreSQL | 14 | 16 recomendado |
| Python | 3.9 | 3.11 recomendado |
| pip | 21+ | para instalar dependências Python |

---

## Variáveis de Ambiente

Copie o arquivo `.env.example` e preencha com seus valores:

```bash
cp .env.example .env
```

### Obrigatórias

| Variável | Descrição | Exemplo |
|---|---|---|
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5432` |
| `DB_NAME` | Nome do banco de dados | `linkup_db` |
| `DB_USER` | Usuário do PostgreSQL | `postgres` |
| `DB_PASS` | Senha do PostgreSQL | `sua_senha` |
| `SESSION_SECRET` | Chave de sessão — deve ser longa e aleatória | `hex 64 chars` |
| `GROQ_API_KEY` | Chave da API Groq | `gsk_...` |
| `GMAIL_USER` | E-mail Gmail para envio | `app@gmail.com` |
| `GMAIL_PASS` | App Password do Gmail (16 dígitos) | `xxxx xxxx xxxx xxxx` |
| `NODE_ENV` | Ambiente de execução | `development` \| `production` |

### Opcionais

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do servidor HTTP |
| `BASE_URL` | `http://localhost:3000` | URL base para links em e-mails transacionais |
| `APP_URL` | host da requisição | URL pública usada no link de reset de senha (use atrás de proxy) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Modelo da Groq (centralizado). **Verifique a deprecação em console.groq.com/docs/models antes do deploy.** |
| `CSRF_SECRET` | usa `SESSION_SECRET` | Segredo dedicado ao CSRF (recomendado em produção) |
| `GROQ_DAILY_LIMIT` | `1000` | Teto **global** diário de chamadas à IA (protege a conta Groq) |
| `REDIS_URL` | `redis://localhost:6379` | URL do Redis — Socket.io adapter, lockout de login e limitador global de IA; **obrigatória em produção** |
| `SEARCH_SERVICE_URL` | `http://localhost:5001` | URL do microserviço Python (sobrescrito pelo Docker) |
| `SEARCH_TOKEN` | — | Token compartilhado Node↔Python. Se definido, o serviço de busca exige o header `x-search-token`. Recomendado em produção. |
| `FIT_THRESHOLD` | `60` | Threshold (0-100) do fit de redescoberta de talentos |
| `EMBED_THRESHOLD` | `0.25` | Threshold de similaridade semântica no serviço Python |
| `VALIDATE_COMPANY` | `false` | Habilita verificação de CNPJ e domínio corporativo (fail-closed em produção) |
| `DB_SSL` | `false` (off) | Ative com `true` em provedores gerenciados (Railway/Render/Heroku). Em Docker self-hosted o Postgres interno não usa SSL. |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Com `DB_SSL=true`, definir `false` apenas em provedores com certificado self-signed |
| `LOG_LEVEL` | `info` | Nível de log: `error` \| `warn` \| `info` \| `debug` |
| `SEED_PASSWORD` | — | Senha padrão dos usuários criados pelo seed |

### Como gerar SESSION_SECRET

```bash
# Linux/macOS
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Windows (PowerShell)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Como configurar Gmail App Password

1. Acesse [myaccount.google.com/security](https://myaccount.google.com/security)
2. Habilite a verificação em dois passos
3. Em "Senhas de app", gere uma senha para "E-mail"
4. Use os 16 dígitos gerados como `GMAIL_PASS`

> **Nunca use sua senha principal do Gmail.** App Passwords são revogáveis individualmente e não expõem sua conta principal.

---

## Configuração do Banco de Dados

### 1. Criar o banco

```bash
# Via CLI do PostgreSQL
createdb linkup_db -U postgres

# Ou via psql
psql -U postgres -c "CREATE DATABASE linkup_db;"
```

### 2. Executar migrações

```bash
npm run migrate
# ou diretamente:
npx sequelize-cli db:migrate
```

O projeto tem 29 migrações que evoluem o schema desde a criação das tabelas base até adições recentes como `isPcd`, `stageHistory`, `rediscoveryData` e `passwordChangedAt`.

### 3. Popular com dados de teste (opcional)

```bash
node seed.js
```

Cria usuários candidatos e empresas de exemplo com vagas e candidaturas. Usa `SEED_PASSWORD` como senha para todos os usuários gerados.

### Desfazer migrações (desenvolvimento)

```bash
# Desfaz a última migração
npx sequelize-cli db:migrate:undo

# Desfaz todas
npx sequelize-cli db:migrate:undo:all
```

---

## Instalação das Dependências Node.js

```bash
npm install
```

Para verificar vulnerabilidades conhecidas:

```bash
npm audit
```

---

## Microserviço Python — Busca Semântica

O microserviço é um processo Flask independente que deve ser iniciado separadamente da aplicação principal.

### 1. Criar e ativar ambiente virtual

```bash
cd python-search

# Criar venv
python -m venv venv

# Ativar — Linux/macOS
source venv/bin/activate

# Ativar — Windows
venv\Scripts\activate
```

### 2. Instalar dependências

```bash
pip install -r requirements.txt
```

Dependências principais:
- `flask` + `flask-cors` — servidor HTTP
- `sentence-transformers` — modelo de embeddings multilíngue
- `rank-bm25` — ranking por frequência de tokens
- `numpy` — operações vetoriais

> **Atenção:** a primeira execução faz download do modelo `paraphrase-multilingual-MiniLM-L12-v2` (~100MB). Isso é feito automaticamente pelo `sentence-transformers`.

### 3. Iniciar o serviço

```bash
python app.py
# Rodando em http://localhost:5001
```

### Verificar saúde do serviço

```bash
curl http://localhost:5001/health
# {"status": "ok", "model": "paraphrase-multilingual-MiniLM-L12-v2"}
```

### No Windows

Use o script batch incluído no projeto:

```
start-search.bat
```

---

## Executando a Aplicação Principal

### Desenvolvimento (com hot-reload)

```bash
npm run dev
```

Usa `nodemon` para reiniciar automaticamente ao salvar arquivos.

### Produção

```bash
npm start
```

Executa `node server.js` diretamente.

### Acessar a aplicação

```
http://localhost:3000
```

---

## Deploy com Docker

A forma mais simples de subir todos os serviços juntos (PostgreSQL, Redis, Python e Node.js).

### Pré-requisitos

- Docker Engine 24+
- Docker Compose v2 (`docker compose`, não `docker-compose`)

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com os valores obrigatórios
```

> O `docker-compose.yml` sobrescreve automaticamente `DB_HOST`, `REDIS_URL` e `SEARCH_SERVICE_URL` para os nomes internos dos containers — não defina esses três no `.env` ao usar Docker.

### 2. Subir todos os serviços

```bash
docker compose up --build -d
```

Ordem de inicialização garantida por `healthcheck`:
1. `db` (PostgreSQL 16) — aguarda `pg_isready`
2. `redis` (Redis 7) — aguarda `redis-cli ping`
3. `search` (Python + gunicorn, 2 workers) — aguarda `/health`
4. `app` (Node.js 20) — executa `db:migrate` e inicia `server.js`; tem healthcheck próprio em `/health`

> Em produção o schema é gerido **exclusivamente por migrations** (`db:migrate`). O `sequelize.sync()` é desativado quando `NODE_ENV=production` — não há reescrita automática do schema a partir dos models.

### 3. Popular banco com dados de teste (opcional)

```bash
npm run seed:docker
# equivale a: docker compose exec app node seed.js
```

### Comandos úteis

```bash
# Ver logs em tempo real
docker compose logs -f app

# Reiniciar apenas a aplicação
docker compose restart app

# Parar tudo
docker compose down

# Parar e remover volumes (apaga o banco)
docker compose down -v
```

### Serviços e portas expostas

| Serviço  | Imagem              | Porta host |
|----------|---------------------|------------|
| `app`    | build local         | 3000       |
| `db`     | postgres:16-alpine  | — (interna)|
| `search` | build local (Python)| — (interna)|
| `redis`  | redis:7-alpine      | — (interna)|

> Apenas o `app` publica porta ao host (3000). `db`, `redis` e `search` ficam **acessíveis somente pela rede interna** do compose (`db:5432`, `redis:6379`, `search:5001`) — não ficam expostos à internet. Para depurar o banco localmente, descomente o mapeamento `127.0.0.1:5432:5432` no `docker-compose.yml`.

> **Uploads** (avatares/currículos) são persistidos no volume nomeado `uploads_data` montado em `/app/public/uploads` — não são perdidos em redeploy.

### Variáveis injetadas automaticamente pelo Docker

| Variável             | Valor injetado           |
|----------------------|--------------------------|
| `DB_HOST`            | `db`                     |
| `REDIS_URL`          | `redis://redis:6379`     |
| `SEARCH_SERVICE_URL` | `http://search:5001`     |

---

## Preparação para Produção

### Variáveis críticas de produção

```env
NODE_ENV=production
SESSION_SECRET=<string aleatória de 64+ caracteres>
CSRF_SECRET=<string aleatória de 32+ caracteres>
VALIDATE_COMPANY=true
BASE_URL=https://seudominio.com.br
APP_URL=https://seudominio.com.br
SEARCH_TOKEN=<string aleatória — protege o serviço Python>
GROQ_MODEL=<modelo suportado — confirme em console.groq.com/docs/models>
# Em provedor gerenciado (Railway/Render/Heroku):
# DB_SSL=true
```

Com `NODE_ENV=production`:
- Cookies de sessão ficam com `secure: true` (apenas HTTPS)
- `app.set('trust proxy', 1)` é ativado (necessário atrás de proxy para cookies `secure` e rate-limit por IP)
- Helmet habilita HSTS
- Logs de SQL do Sequelize são desabilitados
- O schema é gerido só por migrations (`sync` desativado)

> **HTTPS / reverse proxy.** O app serve HTTP na porta 3000 — coloque um reverse proxy (Caddy resolve TLS automaticamente, ou Nginx) terminando HTTPS e fazendo proxy para `app:3000`. Sem TLS na frente, os cookies `secure` não trafegam.

> **Segredos.** Rotacione `GMAIL_PASS`, `GROQ_API_KEY` e `SESSION_SECRET` antes de tornar o repositório público — qualquer valor que já esteve em um `.env` versionado/compartilhado deve ser tratado como vazado.
- Mensagens de erro genéricas são retornadas (sem stack traces)
- `REDIS_URL` se torna obrigatória (validada na inicialização)

> **Redis em produção:** com `REDIS_URL` configurada, o Socket.io adapter Redis é ativado automaticamente, permitindo que notificações push se propaguem entre múltiplas instâncias. As sessões continuam no PostgreSQL.

### Processo recomendado com PM2

```bash
npm install -g pm2

# Iniciar aplicação principal
pm2 start server.js --name linkup-app

# Iniciar microserviço Python
pm2 start "cd python-search && python app.py" --name linkup-search --interpreter bash

# Salvar configuração
pm2 save
pm2 startup   # configura reinício automático
```

### Nginx como reverse proxy

Configuração mínima para servir a aplicação em produção:

```nginx
server {
    listen 80;
    server_name seudominio.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> O header `Upgrade` + `Connection` é necessário para o Socket.io funcionar corretamente.

### HTTPS com Let's Encrypt

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d seudominio.com.br
```

---

## Scripts disponíveis

| Script | Comando | Descrição |
|---|---|---|
| `npm start` | `node server.js` | Inicia em modo produção |
| `npm run dev` | `nodemon server.js` | Inicia com hot-reload |
| `npm run migrate` | `sequelize-cli db:migrate` | Executa migrações pendentes |
| `npm run migrate:undo` | `sequelize-cli db:migrate:undo:all` | Reverte todas as migrações |
| `npm run seed` | `node seed.js` | Popula banco com dados de teste (local) |
| `npm run seed:docker` | `docker compose exec app node seed.js` | Popula banco dentro do container em execução |
| `npm test` | `jest --config tests/jest.config.js` | Executa a suíte de testes (172 testes) |
| `npm run test:coverage` | `jest ... --coverage` | Testes com relatório de cobertura |

---

## Estrutura de Logs

Com `LOG_LEVEL=info`, a aplicação produz logs JSON estruturados em stdout:

```json
{
  "level": "info",
  "context": "talentRediscovery",
  "message": "Talentos notificados",
  "data": { "jobId": 42, "notified": 3 },
  "timestamp": "2026-03-30T14:32:10.000Z"
}
```

Redirecione para um arquivo ou agregador de logs em produção:

```bash
# Arquivo local
npm start >> logs/app.log 2>&1

# Com PM2 (recomendado)
pm2 logs linkup-app
```

---

## Checklist de Deploy

### Docker
- [ ] `docker compose up --build -d` sem erros
- [ ] `docker compose logs app` mostra "Servidor rodando na porta 3000"
- [ ] `docker compose logs search` mostra o modelo carregado
- [ ] Seed executado se necessário (`npm run seed:docker`)

### Manual (PM2 + Nginx)
- [ ] `.env` preenchido com todos os valores obrigatórios
- [ ] `SESSION_SECRET` é uma string aleatória longa (nunca o valor de exemplo)
- [ ] `NODE_ENV=production`
- [ ] Banco PostgreSQL criado e migrações executadas
- [ ] Microserviço Python rodando e respondendo em `/health`
- [ ] `SEARCH_SERVICE_URL` aponta para o endereço correto do Python
- [ ] Gmail App Password configurado e testado
- [ ] `BASE_URL` configurado com o domínio de produção
- [ ] HTTPS configurado (Nginx + Let's Encrypt)
- [ ] PM2 configurado para reinício automático
- [ ] `REDIS_URL` configurada (obrigatória em produção — habilita Socket.io multi-instância)
- [ ] `npm audit` sem vulnerabilidades críticas (0 vulnerabilidades na versão atual)

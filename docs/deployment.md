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
| `SEARCH_SERVICE_URL` | `http://localhost:5001` | URL do microserviço Python |
| `VALIDATE_COMPANY` | `false` | Habilita verificação de CNPJ e domínio corporativo |
| `LOG_LEVEL` | `info` | Nível de log: `error` \| `warn` \| `info` \| `debug` |
| `SEED_PASSWORD` | — | Senha padrão dos usuários criados pelo seed |
| `BASE_URL` | `http://localhost:3000` | URL base para links em e-mails |

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

O projeto tem 30 migrações que evoluem o schema desde a criação das tabelas base até adições recentes como `isPcd`, `stageHistory` e `rediscoveryData`.

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

## Preparação para Produção

### Variáveis críticas de produção

```env
NODE_ENV=production
SESSION_SECRET=<string aleatória de 64+ caracteres>
VALIDATE_COMPANY=true
BASE_URL=https://seudominio.com.br
```

Com `NODE_ENV=production`:
- Cookies de sessão ficam com `secure: true` (apenas HTTPS)
- Helmet habilita HSTS
- Logs de SQL do Sequelize são desabilitados
- Mensagens de erro genéricas são retornadas (sem stack traces)

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
| `npm run seed` | `node seed.js` | Popula banco com dados de teste |

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
- [ ] `npm audit` sem vulnerabilidades críticas

# Getting Started — LinkUp com Docker

Guia de instalação passo a passo para rodar o LinkUp inteiramente via Docker no Windows.

---

## Pré-requisitos

### 1. Docker Desktop

Baixe e instale o [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/).

Durante a instalação, o assistente vai perguntar sobre o backend:

- Selecione **"Use WSL 2 instead of Hyper-V"** (recomendado)
- Após instalar, abra o Docker Desktop e aguarde o ícone na bandeja do sistema ficar verde ("Engine running")

Verifique a instalação:

```bash
docker --version
docker compose version
```

### 2. WSL2 no Windows

O Docker Desktop no Windows roda os containers dentro de uma VM Linux (WSL2). Se o WSL2 não estiver configurado:

```powershell
# PowerShell como Administrador
wsl --install
```

Reinicie o sistema se solicitado. Após reiniciar:

```powershell
wsl --set-default-version 2
wsl --list --verbose   # confirma que a distribuição está em VERSION 2
```

---

## Preparação do Disco (WSL2 VHDX)

O Docker armazena as imagens e layers dentro de um arquivo de disco virtual (`ext4.vhdx`) do WSL2. O tamanho padrão pode ser insuficiente para imagens com dependências pesadas — especialmente o Chromium, necessário para geração de PDF pelo `html-pdf-node`.

**Sintoma típico de disco cheio:** erros de I/O no build do Chromium ou ao rodar o container.

### Como expandir o VHDX para 100 GB

1. **Feche o Docker Desktop e encerre o WSL:**

```powershell
wsl --shutdown
```

2. **Localize o arquivo VHDX** (caminho padrão):

```
%LOCALAPPDATA%\Docker\wsl\data\ext4.vhdx
```

Se não encontrar, procure em:

```
%LOCALAPPDATA%\Packages\CanonicalGroupLimited.*\LocalState\ext4.vhdx
```

3. **Expanda com diskpart** (PowerShell como Administrador):

```powershell
diskpart
```

Dentro do prompt `DISKPART>`:

```
select vdisk file="C:\Users\SEU_USUARIO\AppData\Local\Docker\wsl\data\ext4.vhdx"
expand vdisk maximum=102400
exit
```

> `102400` = 100 GB em megabytes. Substitua o caminho pelo caminho real do seu `.vhdx`.

4. **Expanda o filesystem dentro do WSL:**

```powershell
wsl -d docker-desktop
resize2fs /dev/sdb
exit
```

5. **Reinicie o Docker Desktop** e confirme o espaço disponível:

```bash
docker system df
```

---

## Configuração do Ambiente

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd "Projeto - Tcc"
```

### 2. Crie o arquivo `.env`

```bash
cp .env.example .env
```

Edite o `.env` e preencha os valores obrigatórios:

```env
# Banco de dados — DB_HOST é ignorado no Docker (compose usa "db" internamente)
DB_PASS=uma_senha_forte_aqui
DB_NAME=linkup_db
DB_USER=postgres

# Sessão (gerar com o comando abaixo)
SESSION_SECRET=

# API de IA
GROQ_API_KEY=gsk_...

# E-mail Gmail
GMAIL_USER=seu@gmail.com
GMAIL_PASS=xxxx xxxx xxxx xxxx

# Senha padrão para usuários criados pelo seed
SEED_PASSWORD=senha_para_testes

# Ambiente
NODE_ENV=development
```

**Gerando o SESSION_SECRET:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> `DB_HOST` no `.env` não afeta o Docker — o `docker-compose.yml` sobrescreve com `DB_HOST=db` automaticamente.

---

## Build e Inicialização

### 1. Build das imagens

```bash
docker compose build
```

Este comando:
- Compila a imagem Node.js (`app`) com o Chromium e todas as dependências npm
- Compila a imagem Python (`search`) com Flask e o modelo sentence-transformers (~100 MB de download na primeira vez)

> O primeiro build demora alguns minutos. Os layers ficam em cache para builds subsequentes.

### 2. Subir os serviços

```bash
docker compose up -d
```

O Docker sobe três serviços em ordem de dependência:

| Serviço | Porta | Aguarda |
|---------|-------|---------|
| `db` | 5432 | — |
| `search` | 5001 | — |
| `app` | 3000 | `db` healthy + `search` healthy |

O `app` só inicia depois que o `db` responder ao healthcheck (`pg_isready`) e o `search` responder em `/health`. Isso é gerenciado automaticamente pelo `depends_on: condition: service_healthy` no `docker-compose.yml`.

---

## Setup do Banco de Dados

### 1. Rodar as migrações

```bash
docker compose exec app npx sequelize-cli db:migrate
```

Aplica as 30+ migrações que criam todas as tabelas do schema (usuários, vagas, candidaturas, pipeline, etc.).

### 2. Popular com dados de teste (opcional)

```bash
docker compose exec app node seed.js
```

Cria empresas, candidatos, vagas e candidaturas de exemplo. Usa `SEED_PASSWORD` como senha para todos os usuários gerados.

> Para rodar o seed a partir da máquina host (sem entrar no container):
> ```bash
> npm run seed:docker
> ```

---

## Verificação

### Status dos containers

```bash
docker compose ps
```

Todos os serviços devem aparecer com status `healthy`:

```
NAME              STATUS
projeto-db-1      Up X minutes (healthy)
projeto-search-1  Up X minutes (healthy)
projeto-app-1     Up X minutes (healthy)
```

Se algum serviço aparecer como `starting` ou `unhealthy`, verifique os logs:

```bash
docker compose logs db       # logs do PostgreSQL
docker compose logs search   # logs do microserviço Python
docker compose logs app      # logs do Node.js
```

### URLs de acesso

| Serviço | URL | Esperado |
|---------|-----|----------|
| Aplicação principal | `http://localhost:3000` | Página de landing do LinkUp |
| Health do microserviço Python | `http://localhost:5001/health` | `{"status":"ok","service":"linkup-semantic-search"}` |

---

## Comandos Úteis

```bash
# Parar os serviços (mantém volumes)
docker compose down

# Parar e remover volumes (apaga o banco)
docker compose down -v

# Rebuild forçado após mudanças no código
docker compose build --no-cache && docker compose up -d

# Abrir shell dentro do container da aplicação
docker compose exec app sh

# Ver logs em tempo real
docker compose logs -f app

# Desfazer todas as migrações
docker compose exec app npx sequelize-cli db:migrate:undo:all
```

---

## Resolução de Problemas Comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `app` reinicia em loop | Banco ainda não está pronto | Aguarde o `db` ficar `healthy`; verifique `DB_PASS` no `.env` |
| `search` fica em `starting` | Modelo sendo baixado na 1ª vez | Aguarde — o download do sentence-transformers pode levar 2–3 min |
| Erro de I/O no build | Disco WSL2 cheio | Expanda o VHDX para 100 GB (veja seção "Preparação do Disco") |
| `Cannot connect to Docker daemon` | Docker Desktop não está rodando | Abra o Docker Desktop e aguarde o engine iniciar |
| Porta 5432 já em uso | PostgreSQL local rodando | Pare o serviço local ou mude a porta em `docker-compose.yml` |

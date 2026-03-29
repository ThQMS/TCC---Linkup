const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LinkUp API',
            version: '1.0.0',
            description: 'API da plataforma de recrutamento inteligente LinkUp. Developed by Thiago — TCC 2025.'
        },
        servers: [{ url: 'http://localhost:3000', description: 'Servidor local' }],
        tags: [
            { name: 'Auth',    description: 'Autenticação e cadastro' },
            { name: 'Jobs',    description: 'Vagas de emprego' },
            { name: 'Resume',  description: 'Currículo do candidato' },
            { name: 'IA',      description: 'Features de Inteligência Artificial (Groq/LLaMA)' },
            { name: 'Metrics', description: 'Métricas de uso da IA' }
        ],
        components: {
            schemas: {
                Job: {
                    type: 'object',
                    properties: {
                        id:           { type: 'integer' },
                        title:        { type: 'string', example: 'Desenvolvedor React' },
                        company:      { type: 'string', example: 'TechBridge' },
                        description:  { type: 'string' },
                        requirements: { type: 'string' },
                        benefits:     { type: 'string' },
                        differential: { type: 'string' },
                        salary:       { type: 'string', example: '7.000 - 10.000' },
                        modality:     { type: 'string', enum: ['remoto', 'presencial', 'híbrido'] },
                        status:       { type: 'string', enum: ['aberta', 'pausada', 'encerrada'] },
                        views:        { type: 'integer' }
                    }
                },
                AiCompatibilityResponse: {
                    type: 'object',
                    properties: {
                        score:    { type: 'integer', minimum: 0, maximum: 100, example: 78 },
                        analysis: { type: 'string',  example: 'Você tem boa compatibilidade com esta vaga...' }
                    }
                },
                AiRankingResponse: {
                    type: 'object',
                    properties: {
                        rankings: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    applicationId: { type: 'integer' },
                                    score:         { type: 'integer', minimum: 0, maximum: 100 },
                                    analysis:      { type: 'string' }
                                }
                            }
                        }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: { error: { type: 'string' } }
                }
            }
        }
    },
    apis: [] // Rotas definidas inline abaixo via paths
};

// ── Paths documentados manualmente (sem JSDoc nas rotas para não poluir o código) ──
const swaggerSpec = swaggerJsdoc(options);

swaggerSpec.paths = {
    // ── AUTH ──
    '/login': {
        post: {
            tags: ['Auth'], summary: 'Login do usuário',
            requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona para / em caso de sucesso ou /login em caso de erro' } }
        }
    },
    '/register': {
        post: {
            tags: ['Auth'], summary: 'Cadastro de novo usuário',
            requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', required: ['name', 'email', 'password', 'userType'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 6 }, userType: { type: 'string', enum: ['candidato', 'empresa'] }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona para /verify após cadastro' } }
        }
    },
    '/logout': {
        get: {
            tags: ['Auth'], summary: 'Logout',
            responses: { 302: { description: 'Redireciona para /login' } }
        }
    },

    // ── JOBS ──
    '/jobs/add': {
        post: {
            tags: ['Jobs'], summary: 'Criar nova vaga (empresa)',
            requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', required: ['title', 'company', 'description', 'email'], properties: { title: { type: 'string' }, company: { type: 'string' }, description: { type: 'string' }, email: { type: 'string', format: 'email' }, salary: { type: 'string' }, modality: { type: 'string', enum: ['remoto', 'presencial', 'híbrido'] }, requirements: { type: 'string' }, benefits: { type: 'string' }, differential: { type: 'string' }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona para / após criar' }, 422: { description: 'Erro de validação' } }
        }
    },
    '/jobs/view/{id}': {
        get: {
            tags: ['Jobs'], summary: 'Detalhes de uma vaga',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: { description: 'Página da vaga' }, 302: { description: 'Vaga não encontrada' } }
        }
    },
    '/jobs/update': {
        post: {
            tags: ['Jobs'], summary: 'Atualizar vaga (empresa dona)',
            requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', required: ['id', 'title', 'company', 'description', 'email'], properties: { id: { type: 'integer' }, title: { type: 'string' }, status: { type: 'string', enum: ['aberta', 'pausada', 'encerrada'] }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona após atualizar' } }
        }
    },
    '/jobs/delete/{id}': {
        post: {
            tags: ['Jobs'], summary: 'Excluir vaga (empresa dona)',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 302: { description: 'Redireciona para / após excluir' } }
        }
    },
    '/jobs/apply/{id}': {
        post: {
            tags: ['Jobs'], summary: 'Candidatar-se a uma vaga (candidato)',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { coverLetter: { type: 'string', description: 'Carta de apresentação opcional' }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona após candidatura. E-mail com currículo PDF é enviado automaticamente.' } }
        }
    },
    '/jobs/my-applications': {
        get: {
            tags: ['Jobs'], summary: 'Lista candidaturas do candidato logado',
            responses: { 200: { description: 'Lista de candidaturas com status' } }
        }
    },
    '/jobs/my-applications/pdf': {
        get: {
            tags: ['Jobs'], summary: 'Exportar candidaturas em PDF',
            responses: { 200: { description: 'PDF com histórico de candidaturas', content: { 'application/pdf': {} } } }
        }
    },
    '/jobs/favorites': {
        get: {
            tags: ['Jobs'], summary: 'Lista vagas favoritas do candidato',
            responses: { 200: { description: 'Lista de vagas favoritas' } }
        }
    },
    '/jobs/favorite/{id}': {
        post: {
            tags: ['Jobs'], summary: 'Favoritar ou desfavoritar uma vaga',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 302: { description: 'Redireciona de volta à vaga' } }
        }
    },
    '/jobs/applications/{id}': {
        get: {
            tags: ['Jobs'], summary: 'Lista candidatos de uma vaga (empresa)',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { 200: { description: 'Lista de candidatos com skills' } }
        }
    },
    '/jobs/applications/status': {
        post: {
            tags: ['Jobs'], summary: 'Atualizar status de candidatura (empresa)',
            requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', required: ['applicationId', 'status', 'jobId'], properties: { applicationId: { type: 'integer' }, status: { type: 'string', enum: ['pendente', 'aceito', 'recusado'] }, jobId: { type: 'integer' }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona de volta à lista de candidatos' } }
        }
    },

    // ── RESUME ──
    '/resume/create': {
        get: {
            tags: ['Resume'], summary: 'Formulário de criação/edição do currículo',
            responses: { 200: { description: 'Página do formulário' } }
        }
    },
    '/resume/save': {
        post: {
            tags: ['Resume'], summary: 'Salvar ou atualizar currículo',
            requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { summary: { type: 'string' }, experiences: { type: 'string', description: 'JSON serializado' }, education: { type: 'string', description: 'JSON serializado' }, skills: { type: 'string', description: 'JSON serializado' }, phone: { type: 'string' }, city: { type: 'string' }, linkedin: { type: 'string' }, github: { type: 'string' }, _csrf: { type: 'string' } } } } } },
            responses: { 302: { description: 'Redireciona para /resume/view' } }
        }
    },
    '/resume/view': {
        get: {
            tags: ['Resume'], summary: 'Visualizar currículo do usuário logado',
            responses: { 200: { description: 'Página do currículo com opções de exportação PDF' } }
        }
    },

    // ── IA ──
    '/jobs/ai/cover-letter/{id}': {
        post: {
            tags: ['IA'], summary: 'Gerar carta de apresentação (candidato)',
            description: 'Usa LLaMA 3.3 70B via Groq. Cruza o currículo do candidato com os dados da vaga para gerar uma carta personalizada.',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da vaga' }],
            responses: {
                200: { description: 'Carta gerada', content: { 'application/json': { schema: { type: 'object', properties: { letter: { type: 'string' } } } } } },
                400: { description: 'Currículo não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
            }
        }
    },
    '/jobs/ai/compatibility/{jobId}': {
        post: {
            tags: ['IA'], summary: 'Verificar compatibilidade candidato x vaga (candidato)',
            description: 'Analisa o currículo do candidato frente aos requisitos da vaga. Retorna score 0-100 e análise detalhada.',
            parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: {
                200: { description: 'Score e análise', content: { 'application/json': { schema: { $ref: '#/components/schemas/AiCompatibilityResponse' } } } },
                400: { description: 'Currículo não cadastrado' },
                403: { description: 'Usuário não é candidato' }
            }
        }
    },
    '/jobs/ai/improve': {
        post: {
            tags: ['IA'], summary: 'Melhorar campo da descrição de vaga (empresa)',
            description: 'Recebe um campo de texto da vaga (descrição, requisitos, benefícios, diferencial) e retorna versão melhorada.',
            requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { fieldLabel: { type: 'string', example: 'Descrição' }, content: { type: 'string' }, title: { type: 'string' } } } } } },
            responses: {
                200: { description: 'Texto melhorado', content: { 'application/json': { schema: { type: 'object', properties: { improved: { type: 'string' } } } } } }
            }
        }
    },
    '/jobs/ai/rank/{jobId}': {
        post: {
            tags: ['IA'], summary: 'Ranking de candidatos por IA (empresa)',
            description: 'Analisa todos os candidatos da vaga e gera um ranking de compatibilidade com score e análise individual.',
            parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: {
                200: { description: 'Rankings ordenados', content: { 'application/json': { schema: { $ref: '#/components/schemas/AiRankingResponse' } } } },
                403: { description: 'Sem permissão' },
                404: { description: 'Vaga não encontrada' }
            }
        }
    },
    '/resume/ai/improve': {
        post: {
            tags: ['IA'], summary: 'Melhorar campo do currículo (candidato)',
            description: 'Melhora resumo profissional ou descrição de experiência usando LLaMA. Usa prompts específicos por campo (STAR para experiências).',
            requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['field', 'content'], properties: { field: { type: 'string', enum: ['summary', 'experience'], example: 'summary' }, content: { type: 'string' }, context: { type: 'string', description: 'Cargo/empresa (obrigatório quando field=experience)' } } } } } },
            responses: {
                200: { description: 'Texto melhorado', content: { 'application/json': { schema: { type: 'object', properties: { improved: { type: 'string' } } } } } }
            }
        }
    },
    '/resume/ai/import': {
        post: {
            tags: ['IA'], summary: 'Importar currículo via PDF ou texto (candidato)',
            description: 'Extrai dados estruturados de um PDF ou texto de currículo usando LLaMA. Retorna JSON com experiências, formação, habilidades e dados de contato.',
            requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { pdf: { type: 'string', format: 'binary', description: 'Arquivo PDF do currículo' }, text: { type: 'string', description: 'Texto do currículo (alternativa ao PDF)' } } } } } },
            responses: {
                200: { description: 'Dados extraídos do currículo', content: { 'application/json': { schema: { type: 'object', properties: { summary: { type: 'string' }, experiences: { type: 'array', items: { type: 'object' } }, education: { type: 'array', items: { type: 'object' } }, skills: { type: 'array', items: { type: 'string' } }, phone: { type: 'string' }, city: { type: 'string' }, linkedin: { type: 'string' }, github: { type: 'string' } } } } } },
                400: { description: 'Conteúdo insuficiente' }
            }
        }
    },

    // ── METRICS ──
    '/ai-metrics': {
        get: {
            tags: ['Metrics'], summary: 'Métricas de uso das features de IA',
            description: 'Retorna dados agregados: total de chamadas por feature, taxa de sucesso e tempo médio de resposta.',
            responses: {
                200: { description: 'Página de métricas' }
            }
        }
    }
};

module.exports = swaggerSpec;
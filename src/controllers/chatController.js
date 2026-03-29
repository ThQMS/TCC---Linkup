const { Job, Resume }  = require('../models');
const groq             = require('../helpers/groq');
const logAi            = require('../helpers/aiLog');
const parseResume      = require('../helpers/parseResume');

async function buildSystemPrompt(job, userId) {
    let resumeContext = 'Candidato não possui currículo cadastrado na plataforma.';

    try {
        const resume = await Resume.findOne({ where: { userId } });
        if (resume) {
            const { skills, experiences, education } = parseResume(resume);
            resumeContext = [
                resume.summary    ? `Resumo profissional: ${resume.summary}` : '',
                skills.length     ? `Habilidades: ${skills.join(', ')}` : '',
                experiences.length ? `Experiências:\n${experiences.map(e => `- ${e.role} na ${e.company} (${e.period || ''}): ${e.description || ''}`).join('\n')}` : '',
                education.length   ? `Formação:\n${education.map(e => `- ${e.course} em ${e.institution} (${e.period || ''})`).join('\n')}` : '',
            ].filter(Boolean).join('\n\n');
        }
    } catch (e) {}

    return `Você é um assistente especialista em recrutamento e carreira integrado à plataforma LinkUp.
Você está ajudando um candidato a entender e se preparar para uma vaga específica.

VAGA:
Título: ${job.title}
Empresa: ${job.company}
Descrição: ${job.description || 'Não informada'}
Requisitos: ${job.requirements || 'Não informados'}
Benefícios: ${job.benefits || 'Não informados'}
Diferencial: ${job.differential || 'Não informado'}
Modalidade: ${job.modality || 'Não informada'}
Salário: ${job.salary ? 'R$ ' + job.salary : 'A combinar'}

PERFIL DO CANDIDATO:
${resumeContext}

INSTRUÇÕES:
- Responda sempre em português brasileiro
- Seja direto, prático e honesto
- Use o perfil do candidato para personalizar as respostas
- Se o candidato perguntar sobre compatibilidade, analise honestamente pontos fortes e lacunas
- Nunca invente informações sobre a vaga ou o candidato
- Máximo 4 parágrafos por resposta, prefira listas quando fizer sentido
- Não repita o contexto da vaga nas respostas, vá direto ao ponto`;
}

// POST /jobs/:id/chat — resposta streaming via SSE
exports.chat = async (req, res) => {
    const start = Date.now();
    const jobId = parseInt(req.params.id, 10);
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Mensagens inválidas.' });
    }

    const history = messages.slice(-20).map(m => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content).slice(0, 2000)
    }));

    try {
        const job = await Job.findByPk(jobId);
        if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });

        const systemPrompt = await buildSystemPrompt(job, req.user.id);

        res.setHeader('Content-Type',      'text/event-stream');
        res.setHeader('Cache-Control',     'no-cache');
        res.setHeader('Connection',        'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const stream = await groq.chat.completions.create({
            model:       'llama-3.3-70b-versatile',
            messages:    [{ role: 'system', content: systemPrompt }, ...history],
            max_tokens:  800,
            temperature: 0.7,
            stream:      true
        });

        for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();

        await logAi(req.user.id, 'chat-vaga', start, true);
    } catch (err) {
        await logAi(req.user?.id, 'chat-vaga', start, false);
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: 'Erro ao conectar com a IA.' })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ error: 'Erro ao conectar com a IA.' });
        }
    }
};

// GET /jobs/:id/chat/ping — health check
exports.ping = async (req, res) => {
    const job = await Job.findByPk(parseInt(req.params.id, 10)).catch(() => null);
    if (!job) return res.status(404).json({ ok: false });
    res.json({ ok: true, job: job.title });
};

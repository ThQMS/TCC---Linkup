const { Job, Resume }  = require('../models');
const { chatComplete } = require('../helpers/aiService');
const logAi            = require('../helpers/aiLog');
const parseResume      = require('../helpers/parseResume');

exports.start = async (req, res) => {
    const start = Date.now();
    try {
        if (req.user.userType !== 'candidato') return res.status(403).json({ error: 'Apenas candidatos.' });

        const job = await Job.findByPk(parseInt(req.params.jobId, 10));
        if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });

        const resume = await Resume.findOne({ where: { userId: req.user.id } });
        const skills = parseResume(resume).skills.join(', ') || 'Não informadas';

        const question = await chatComplete([{
            role: 'user',
            content: `Você é um entrevistador experiente de RH. Inicie uma entrevista para a vaga abaixo.

VAGA: ${job.title} na ${job.company}
REQUISITOS: ${job.requirements || 'Não informados'}
SKILLS DO CANDIDATO: ${skills}

Faça APENAS a primeira pergunta da entrevista. Deve ser uma pergunta comportamental ou técnica relevante para a vaga. Seja direto, sem introduções longas. Máximo 2 frases.`
        }], { max_tokens: 200, temperature: 0.8 });

        await logAi(req.user.id, 'ai-interview', start, true);
        res.json({ question });
    } catch (err) {
        await logAi(req.user?.id, 'ai-interview', start, false);
        res.status(500).json({ error: 'Erro ao iniciar entrevista.' });
    }
};

exports.answer = async (req, res) => {
    const start = Date.now();
    try {
        const { history, answer, questionNumber } = req.body;

        const job = await Job.findByPk(parseInt(req.params.jobId, 10));
        if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });

        const isLastQuestion = questionNumber >= 5;

        const systemPrompt = `Você é um entrevistador experiente de RH conduzindo uma entrevista para ${job.title} na ${job.company}.

REGRAS:
- Faça perguntas comportamentais, situacionais e técnicas relevantes
- Reaja brevemente à resposta anterior antes de perguntar (1 frase)
- ${isLastQuestion ? 'Esta é a ÚLTIMA pergunta. Após a resposta, encerre a entrevista agradecendo e dizendo que o resultado será comunicado.' : 'Faça a próxima pergunta. Máximo 3 frases no total.'}
- Seja profissional e encorajador
- Responda em português brasileiro`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: answer }
        ];

        const response = await chatComplete(messages, { max_tokens: 250, temperature: 0.8 });
        await logAi(req.user.id, 'ai-interview', start, true);
        res.json({ response, isEnd: isLastQuestion });
    } catch (err) {
        await logAi(req.user?.id, 'ai-interview', start, false);
        res.status(500).json({ error: 'Erro ao processar resposta.' });
    }
};

exports.score = async (req, res) => {
    const start = Date.now();
    try {
        const { history } = req.body;
        const job = await Job.findByPk(parseInt(req.params.jobId, 10));
        if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });

        const transcript = history.map(m =>
            `${m.role === 'user' ? 'Candidato' : 'Entrevistador'}: ${m.content}`
        ).join('\n\n');

        const raw = (await chatComplete([{
            role: 'user',
            content: `Você é um avaliador de RH sênior. Analise a entrevista abaixo e gere uma avaliação estruturada.

VAGA: ${job.title}
REQUISITOS: ${job.requirements || 'Não informados'}

TRANSCRIÇÃO:
${transcript}

Retorne APENAS este JSON sem markdown:
{
  "score": 0-100,
  "comunicacao": 0-10,
  "conhecimento_tecnico": 0-10,
  "fit_cultural": 0-10,
  "pontos_fortes": ["ponto1", "ponto2"],
  "areas_melhoria": ["area1", "area2"],
  "recomendacao": "aprovado|em_analise|reprovado",
  "feedback_geral": "texto de 2-3 linhas"
}`
        }], { max_tokens: 500, temperature: 0.2 })).replace(/```json|```/g, '');

        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'Erro ao processar score.' });

        await logAi(req.user.id, 'ai-interview-score', start, true);
        res.json(JSON.parse(match[0]));
    } catch (err) {
        await logAi(req.user?.id, 'ai-interview-score', start, false);
        res.status(500).json({ error: 'Erro ao gerar score.' });
    }
};

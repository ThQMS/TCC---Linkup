const { Job, Resume }  = require('../models');
const { chatComplete } = require('../helpers/aiService');
const logAi            = require('../helpers/aiLog');
const parseResume      = require('../helpers/parseResume');

exports.tailor = async (req, res) => {
    const start = Date.now();
    try {
        if (req.user.userType !== 'candidato') return res.status(403).json({ error: 'Apenas candidatos.' });

        const job = await Job.findByPk(parseInt(req.params.jobId, 10));
        if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });

        const resume = await Resume.findOne({ where: { userId: req.user.id } });
        if (!resume) return res.status(400).json({ error: 'Crie seu currículo antes de usar esta funcionalidade.' });

        const { skills, experiences, education } = parseResume(resume);

        const resumeText = [
            resume.summary ? 'Resumo: ' + resume.summary : '',
            skills.length  ? 'Skills: ' + skills.join(', ') : '',
            experiences.length ? 'Experiências:\n' + experiences.map(e => `- ${e.role} na ${e.company}: ${e.description || ''}`).join('\n') : '',
            education.length   ? 'Formação:\n'     + education.map(e => `- ${e.course} em ${e.institution}`).join('\n') : ''
        ].filter(Boolean).join('\n\n');

        const raw = (await chatComplete([{
            role: 'user',
            content: `Você é um especialista em RH e reescrita de currículos. Adapte o currículo abaixo para maximizar a compatibilidade com a vaga informada.

VAGA:
Título: ${job.title}
Empresa: ${job.company}
Requisitos: ${job.requirements || 'Não informados'}
Descrição: ${(job.description || '').slice(0, 1000)}

CURRÍCULO ATUAL:
${resumeText.slice(0, 2000)}

Retorne APENAS este JSON sem markdown:
{
  "summary": "resumo profissional reescrito e focado na vaga (máx 4 linhas)",
  "skills_destacadas": ["skill1", "skill2", "skill3"],
  "experiences_reescritas": [
    { "role": "cargo", "company": "empresa", "period": "período", "description": "descrição reescrita com verbos de ação e alinhada à vaga" }
  ],
  "dicas": ["dica1", "dica2", "dica3"],
  "score_antes": 0-100,
  "score_depois": 0-100
}`
        }], { max_tokens: 1200, temperature: 0.5 }
        )).replace(/```json|```/g, '');

        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'Erro ao processar.' });

        await logAi(req.user.id, 'resume-tailoring', start, true);
        res.json(JSON.parse(match[0]));
    } catch (err) {
        await logAi(req.user?.id, 'resume-tailoring', start, false);
        res.status(500).json({ error: 'Erro ao adaptar currículo.' });
    }
};

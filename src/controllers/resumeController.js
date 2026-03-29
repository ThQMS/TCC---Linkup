const { Resume } = require('../models');
const parseResume = require('../helpers/parseResume');
const { chatComplete } = require('../helpers/aiService');
const logAi    = require('../helpers/aiLog');
// pdfjs-dist v4+ é ESM-only — carrega uma vez e reutiliza
let _pdfjsLib = null;
async function getPdfjsLib() {
    if (!_pdfjsLib) _pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return _pdfjsLib;
}

const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]);

function validatePdfMagicBytes(buffer) {
    if (!buffer || buffer.length < 4) return false;
    return buffer.slice(0, 4).equals(PDF_MAGIC_BYTES);
}

exports.getCreate = async (req, res) => {
    try {
        const resume = await Resume.findOne({ where: { userId: req.user.id } });
        res.render('resume-create', {
            user: req.user.toJSON(),
            resume: resume ? { ...resume.toJSON(), ...parseResume(resume) } : null
        });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar currículo.');
        res.redirect('/profile');
    }
};

exports.postSave = async (req, res) => {
    try {
        const { summary, experiences, education, skills, phone, city, birthDate, address, linkedin, github, pdfTemplate } = req.body;

        // Extração automática de skills via IA se candidato não informou manualmente
        let finalSkills = skills;
        try {
            const parsedSkills = JSON.parse(skills || '[]');
            if (parsedSkills.length === 0 && (summary || experiences)) {
                const expText = (() => {
                    try {
                        return JSON.parse(experiences || '[]')
                            .map(e => `${e.role || ''} ${e.description || ''}`)
                            .join(' ');
                    } catch { return ''; }
                })();
                const textForExtraction = [summary || '', expText].join(' ').slice(0, 2000);
                if (textForExtraction.trim().length > 50) {
                    const raw   = await chatComplete(
                        [{ role: 'user', content: `Extraia todas as skills técnicas e comportamentais do texto abaixo. Retorne APENAS um array JSON como: ["React","Node.js","Liderança"]. Sem explicações.\n\nTexto: ${textForExtraction}` }],
                        { max_tokens: 300, temperature: 0.1 }
                    );
                    const match = raw.match(/\[[\s\S]*\]/);
                    if (match) finalSkills = match[0];
                }
            }
        } catch (e) { /* mantém skills originais se IA falhar */ }

        const fields   = { summary, experiences, education, skills: finalSkills, phone, city, birthDate, address, linkedin, github, pdfTemplate };
        const existing = await Resume.findOne({ where: { userId: req.user.id } });
        if (existing) { await existing.update(fields); }
        else { await Resume.create({ userId: req.user.id, ...fields }); }
        req.flash('success_msg', 'Currículo salvo com sucesso!');
        res.redirect('/resume/view');
    } catch (err) {
        req.flash('error_msg', 'Erro ao salvar currículo.');
        res.redirect('/resume/create');
    }
};

exports.getView = async (req, res) => {
    try {
        const resume = await Resume.findOne({ where: { userId: req.user.id } });
        if (!resume) return res.redirect('/resume/create');
        const u = req.user.toJSON(), r = resume.toJSON();
        const contact = {
            phone:     r.phone     || u.phone     || '',
            city:      r.city      || u.city      || '',
            birthDate: r.birthDate || u.birthDate || '',
            address:   r.address   || u.address   || '',
            linkedin:  r.linkedin  || u.linkedin  || '',
            github:    r.github    || u.github    || ''
        };
        res.render('resume-view', {
            user: { ...u, ...contact },
            resume: { ...r, ...parseResume(resume) }
        });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar currículo.');
        res.redirect('/profile');
    }
};

exports.postAiImprove = async (req, res) => {
    const start = Date.now();
    try {
        const { field, content, context } = req.body;
        const prompts = {
            summary:    `Você é um especialista em RH. Reescreva o resumo abaixo de forma mais impactante e profissional. Máximo 4 linhas. Retorne APENAS o texto melhorado, sem markdown, sem asteriscos, sem negrito.\n\nResumo atual: ${content}`,
            experience: `Você é um especialista em RH. Reescreva usando formato STAR (Situação, Tarefa, Ação, Resultado). Use verbos de ação no passado. Retorne APENAS o texto melhorado, sem markdown, sem asteriscos, sem negrito — texto puro.\n\nCargo/Empresa: ${context}\nDescrição atual: ${content}`,
        };
        const prompt = prompts[field] || `Você é um especialista em RH. Melhore o texto abaixo para um currículo. Retorne APENAS o texto melhorado, sem markdown, sem asteriscos, sem negrito.\n\nTexto: ${content}`;
        const improved = await chatComplete([{ role: 'user', content: prompt }], { max_tokens: 500, temperature: 0.7 });
        await logAi(req.user.id, 'improve-resume', start, true);
        res.json({ improved });
    } catch (err) {
        await logAi(req.user?.id, 'improve-resume', start, false);
        res.status(500).json({ error: 'Erro ao processar com IA.' });
    }
};

exports.postAiImport = async (req, res) => {
    const start = Date.now();
    try {
        let text = '';
        if (req.file) {
            if (!validatePdfMagicBytes(req.file.buffer)) {
                return res.status(400).json({ error: 'Arquivo inválido. Envie um PDF real.' });
            }
            const pdfjsLib    = await getPdfjsLib();
            const uint8Array  = new Uint8Array(req.file.buffer);
            const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
            const pdf         = await loadingTask.promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page    = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(' ') + '\n';
            }
        } else {
            text = req.body.text || '';
        }

        if (!text || text.trim().length < 50) return res.status(400).json({ error: 'Conteúdo insuficiente para processar.' });

        let raw = (await chatComplete(
            [{ role: 'user', content: `Você é um especialista em RH. Analise o currículo abaixo e extraia as informações exatamente como estão.\n\nCurrículo:\n${text.slice(0, 3000)}\n\nRetorne APENAS este JSON, sem markdown:\n{\n  "phone": "telefone ou null",\n  "city": "cidade ou null",\n  "birthDate": "data DD/MM/AAAA ou null",\n  "address": "endereço ou null",\n  "linkedin": "url ou null",\n  "github": "url ou null",\n  "summary": "resumo profissional",\n  "experiences": [{ "role": "cargo", "company": "empresa", "period": "período", "description": "descrição" }],\n  "education": [{ "course": "curso", "institution": "instituição", "period": "período" }],\n  "skills": ["skill1", "skill2"]\n}` }],
            { max_tokens: 1500, temperature: 0.2 }
        )).replace(/```json|```/g, '').trim();
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'IA não retornou formato válido.' });

        await logAi(req.user.id, 'import-resume', start, true);
        res.json(JSON.parse(match[0]));
    } catch (err) {
        await logAi(req.user?.id, 'import-resume', start, false);
        res.status(500).json({ error: 'Erro ao processar.' });
    }
};

exports.postTailoringApply = async (req, res) => {
    try {
        const { summary, skills_destacadas, experiences_reescritas } = req.body;
        const resume = await Resume.findOne({ where: { userId: req.user.id } });
        if (!resume) return res.status(404).json({ error: 'Currículo não encontrado.' });

        const updates = {};
        if (summary)                updates.summary     = summary;
        if (skills_destacadas?.length) {
            const current = parseResume(resume).skills;
            const merged  = [...new Set([...skills_destacadas, ...current])];
            updates.skills = JSON.stringify(merged);
        }
        if (experiences_reescritas?.length) {
            updates.experiences = JSON.stringify(experiences_reescritas);
        }

        await resume.update(updates);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao aplicar tailoring.' });
    }
};

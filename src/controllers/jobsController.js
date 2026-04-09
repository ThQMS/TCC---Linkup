const { Op }     = require('sequelize');

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
const { Job, User, Resume, Application, Favorite, JobView } = require('../models');
const UserBlock  = require('../models/UserBlock');
const { generatePdf } = require('../helpers/pdfService');
const { chatComplete } = require('../helpers/aiService');
const logger     = require('../helpers/logger');
const logAi      = require('../helpers/aiLog');
const { getFromCache, setInCache } = require('../utils/aiCache');
const parseResume = require('../helpers/parseResume');
const { formatDate, applicationStatusBadge } = require('../helpers/pdfUtils');
const { applyToJob, cancelApplication, updateApplicationStatus, updateApplicationStage, sendBulkClosingFeedback } = require('../services/applicationService');
const { findTalentsForJob, notifyRevisitedOpportunities, reactivateContact: _reactivateContact, findSimilarCandidates } = require('../services/talentRediscoveryService');
const { findSuggestedCandidates, findCandidatesSimilarTo, contactSuggestedCandidate } = require('../services/similarCandidatesService');

exports.showAdd = (req, res) => res.render('add', { csrfToken: res.locals.csrfToken });

exports.view = async (req, res) => {
    try {
        const job = await Job.findByPk(parseInt(req.params.id, 10));
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }

        try {
            if (req.user) {
                const [, created] = await JobView.findOrCreate({ where: { jobId: job.id, userId: req.user.id } });
                if (created) await job.increment('views');
            } else {
                const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
                const alreadyViewed = await JobView.findOne({ where: { jobId: job.id, ip } });
                if (!alreadyViewed) { await JobView.create({ jobId: job.id, userId: null, ip }); await job.increment('views'); }
            }
        } catch (viewErr) {
            logger.debug('jobsController', 'Erro ao registrar visualização', { err: viewErr.message });
        }

        await job.reload();
        let alreadyApplied = false, isFavorited = false;
        let hasResume = false;
        if (req.user && req.user.userType === 'candidato') {
            const [existing, fav, resume] = await Promise.all([
                Application.findOne({ where: { jobId: job.id, userId: req.user.id } }),
                Favorite.findOne({ where: { jobId: job.id, userId: req.user.id } }),
                Resume.findOne({ where: { userId: req.user.id }, attributes: ['id'] })
            ]);
            alreadyApplied = !!existing;
            isFavorited    = !!fav;
            hasResume      = !!resume;
        }

        const applicantsCount = await Application.count({ where: { jobId: job.id } });
        const titleWord = job.title.split(' ')[0];
        const similarJobs = await Job.findAll({
            where: {
                id:     { [Op.ne]: job.id },
                status: 'aberta',
                [Op.or]: [
                    { title:    { [Op.like]: '%' + titleWord + '%' } },
                    { modality: job.modality }
                ]
            },
            limit: 3,
            order: [['createdAt', 'DESC']]
        });

        const isOwner = !!(req.user && req.user.id === job.UserId);
        res.render('view', {
            job: job.toJSON(), alreadyApplied, hasResume,
            isCandidate: req.user && req.user.userType === 'candidato',
            isOwner,
            isFavorited, applicantsCount,
            similarJobs: similarJobs.map(j => j.toJSON()),
            csrfToken:   res.locals.csrfToken
        });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar detalhes da vaga.');
        res.redirect('/');
    }
};

exports.create = async (req, res) => {
    const { title, salary, company, description, email, new_job } = req.body;
    try {
        const job = await Job.create({
            title, description, salary, company, email,
            newJob:       new_job === 'on',
            UserId:       req.user.id,
            modality:     req.body.modality     || null,
            requirements: req.body.requirements || null,
            benefits:     req.body.benefits     || null,
            differential: req.body.differential || null,
            questions:    req.body.questions    || '[]',
            stages:       req.body.stages       || '[]',
            city:         req.body.city         || null,
            isPcd:        req.body.isPcd        === 'on'
        });
        req.flash('success_msg', 'Vaga adicionada com sucesso!');
        res.redirect('/');

        findTalentsForJob(job, req.user.id).catch(() => {});
        notifyRevisitedOpportunities(job, req.app).catch(() => {});
    } catch (err) {
        req.flash('error_msg', 'Erro ao adicionar vaga.');
        res.redirect('/jobs/add');
    }
};

exports.showEdit = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const job = await Job.findByPk(id);
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }
        if (job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão.'); return res.redirect('/jobs/view/' + id); }
        res.render('edit', { job: job.toJSON(), csrfToken: res.locals.csrfToken });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar vaga.');
        res.redirect('/');
    }
};

exports.update = async (req, res) => {
    const { id, title, description, salary, company, email, new_job, status } = req.body;
    try {
        const job = await Job.findByPk(id);
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }
        if (job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão.'); return res.redirect('/jobs/view/' + id); }
        await job.update({
            title, description, salary, company, email,
            newJob:       new_job === 'on',
            modality:     req.body.modality     || null,
            requirements: req.body.requirements || null,
            benefits:     req.body.benefits     || null,
            differential: req.body.differential || null,
            questions:    req.body.questions    || '[]',
            stages:       req.body.stages       || '[]',
            city:         req.body.city         || null,
            isPcd:        req.body.isPcd        === 'on',
            status:       ['aberta', 'pausada', 'encerrada', 'expirada'].includes(status) ? status : 'aberta'
        });
        req.flash('success_msg', 'Vaga atualizada com sucesso!');
        res.redirect('/jobs/view/' + id);

        if (status === 'aberta') {
            const reactivated = await Job.findByPk(id);
            if (reactivated) {
                findTalentsForJob(reactivated, req.user.id).catch(() => {});
                notifyRevisitedOpportunities(reactivated, req.app).catch(() => {});
            }
        }
    } catch (err) {
        req.flash('error_msg', 'Erro ao atualizar vaga.');
        res.redirect('/jobs/edit/' + id);
    }
};

exports.destroy = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const job = await Job.findByPk(id);
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }
        if (job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão.'); return res.redirect('/jobs/view/' + id); }
        await job.destroy();
        req.flash('success_msg', 'Vaga excluída com sucesso!');
        res.redirect('/');
    } catch (err) {
        req.flash('error_msg', 'Erro ao excluir vaga.');
        res.redirect('/jobs/view/' + parseInt(req.params.id, 10));
    }
};

exports.loginToApply = (req, res) =>
    res.redirect('/login?redirect=/jobs/view/' + parseInt(req.params.id, 10));

exports.apply = async (req, res) => {
    try {
        const job = await Job.findByPk(parseInt(req.params.id, 10));
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }
        if (req.user.userType === 'empresa') { req.flash('error_msg', 'Empresas não podem se candidatar.'); return res.redirect('/jobs/view/' + job.id); }
        if (job.status !== 'aberta') { req.flash('error_msg', 'Esta vaga não está aceitando candidaturas.'); return res.redirect('/jobs/view/' + job.id); }

        const [existing, resume] = await Promise.all([
            Application.findOne({ where: { jobId: job.id, userId: req.user.id } }),
            Resume.findOne({ where: { userId: req.user.id } })
        ]);
        if (existing) { req.flash('error_msg', 'Você já se candidatou a esta vaga!'); return res.redirect('/jobs/view/' + job.id); }
        if (!resume) {
            req.flash('error_msg', 'Você precisa criar seu currículo antes de se candidatar.');
            return res.redirect('/jobs/view/' + job.id);
        }

        const { emailError } = await applyToJob({
            job, user: req.user, resume,
            answers:     req.body.answers     || '[]',
            coverLetter: req.body.coverLetter || ''
        });

        if (emailError) {
            logger.warn('jobsController', 'Falha ao enviar e-mail de candidatura', { err: emailError.message });
            req.flash('error_msg', 'Candidatura registrada, mas houve um problema ao enviar o e-mail para a empresa.');
        } else {
            req.flash('success_msg', 'Candidatura enviada com sucesso para ' + job.company + '!');
        }
        res.redirect('/jobs/view/' + job.id);
    } catch (err) {
        req.flash('error_msg', 'Erro ao enviar candidatura.');
        res.redirect('/jobs/view/' + req.params.id);
    }
};

exports.changeApplicationStatus = async (req, res) => {
    const { applicationId, status, jobId } = req.body;
    try {
        const application = await Application.findByPk(applicationId);
        if (!application) { req.flash('error_msg', 'Candidatura não encontrada.'); return res.redirect('/'); }

        const job = await Job.findByPk(application.jobId);
        if (!job || job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão para alterar esta candidatura.'); return res.redirect('/'); }

        const allowedStatus = ['pendente', 'em análise', 'aprovado', 'rejeitado', 'expirado', 'contratado'];
        if (!allowedStatus.includes(status)) { req.flash('error_msg', 'Status inválido.'); return res.redirect('/jobs/applications/' + jobId); }

        await updateApplicationStatus({ application, job, status, expressApp: req.app });

        req.flash('success_msg', 'Candidatura marcada como ' + status + '!');
        res.redirect('/jobs/applications/' + jobId);
    } catch (err) {
        req.flash('error_msg', 'Erro ao atualizar status.');
        res.redirect('/');
    }
};

exports.listApplications = async (req, res) => {
    try {
        const job = await Job.findByPk(parseInt(req.params.id, 10));
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }
        if (job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão.'); return res.redirect('/'); }

        const applications = await Application.findAll({
            where:   { jobId: job.id },
            include: [{ model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'city', 'avatar'] }],
            order:   [['createdAt', 'DESC']]
        });

        const userIds   = applications.map(a => a.userId);
        const resumes   = await Resume.findAll({ where: { userId: { [Op.in]: userIds } } });
        const resumeMap = Object.fromEntries(resumes.map(r => [r.userId, r]));

        const data = applications.map(app => {
            const { skills } = parseResume(resumeMap[app.userId]);
            return { ...app.toJSON(), skills };
        });

        const jobStages = JSON.parse(job.stages || '[]');
        res.render('applications', { job: job.toJSON(), applicants: data, jobStages, csrfToken: res.locals.csrfToken });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar candidaturas.');
        res.redirect('/');
    }
};

exports.myApplications = async (req, res) => {
    try {
        const applications = await Application.findAll({
            where:   { userId: req.user.id },
            include: [{ model: Job, as: 'job' }],
            order:   [['createdAt', 'DESC']]
        });
        res.render('my-applications', { applications: applications.map(a => a.toJSON()) });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar candidaturas.');
        res.redirect('/');
    }
};

exports.myApplicationsPdf = async (req, res) => {
    try {
        const applications = await Application.findAll({
            where:   { userId: req.user.id },
            include: [{ model: Job, as: 'job' }],
            order:   [['createdAt', 'DESC']]
        });
        const data       = applications.map(app => ({ ...app.toJSON() }));
        const total      = data.length;
        const aprovados  = data.filter(a => a.status === 'aprovado').length;
        const rejeitados = data.filter(a => a.status === 'rejeitado').length;
        const pendentes  = data.filter(a => a.status === 'pendente' || !a.status).length;

        const rows = data.filter(a => a.job).map(a =>
            '<tr>' +
            '<td style="padding:12px 16px;border-bottom:1px solid #f0f0f0"><p style="font-weight:700;margin:0 0 2px">' + escapeHtml(a.job.title) + '</p><p style="margin:0;color:#e53935;font-size:.85rem">' + escapeHtml(a.job.company) + '</p></td>' +
            '<td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.85rem;text-transform:capitalize">' + escapeHtml(a.job.modality || '—') + '</td>' +
            '<td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.85rem">' + (a.job.salary ? 'R$ ' + escapeHtml(a.job.salary) : '—') + '</td>' +
            '<td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.85rem">' + applicationStatusBadge(a.status) + '</td>' +
            '<td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#888;font-size:.82rem">' + formatDate(a.createdAt) + '</td>' +
            '</tr>'
        ).join('');

        const html =
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>' +
            '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#333;background:white;padding:32px}' +
            '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #e53935;margin-bottom:28px}' +
            '.header-logo{font-size:1.6rem;font-weight:800}.header-logo span{color:#e53935}' +
            '.header-info{text-align:right;font-size:.8rem;color:#888}.header-info strong{display:block;font-size:1rem;color:#333}' +
            '.summary{display:flex;gap:16px;margin-bottom:28px}.summary-card{flex:1;border:1px solid #eee;border-radius:10px;padding:16px;text-align:center}' +
            '.summary-card .num{font-size:1.8rem;font-weight:800}.summary-card .label{font-size:.75rem;color:#888;margin-top:4px}' +
            '.summary-card.total .num{color:#333}.summary-card.aprovado .num{color:#2e7d32}.summary-card.rejeitado .num{color:#c62828}.summary-card.pendente .num{color:#f57f17}' +
            '.section-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#e53935;margin-bottom:12px}' +
            'table{width:100%;border-collapse:collapse}thead tr{background:#e53935}thead th{padding:10px 16px;color:white;font-size:.8rem;font-weight:700;text-align:left}' +
            '.footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:.75rem;color:#aaa}' +
            '</style></head><body>' +
            '<div class="header"><div class="header-logo">Link<span>Up</span></div>' +
            '<div class="header-info"><strong>' + req.user.name + '</strong>Relatório gerado em ' + formatDate(new Date()) + '</div></div>' +
            '<div class="summary">' +
            '<div class="summary-card total"><div class="num">' + total + '</div><div class="label">Total</div></div>' +
            '<div class="summary-card aprovado"><div class="num">' + aprovados + '</div><div class="label">Aprovadas</div></div>' +
            '<div class="summary-card rejeitado"><div class="num">' + rejeitados + '</div><div class="label">Rejeitadas</div></div>' +
            '<div class="summary-card pendente"><div class="num">' + pendentes + '</div><div class="label">Pendentes</div></div>' +
            '</div>' +
            '<p class="section-title">Histórico de candidaturas</p>' +
            '<table><thead><tr><th>Vaga / Empresa</th><th>Modalidade</th><th>Salário</th><th>Status</th><th>Data</th></tr></thead>' +
            '<tbody>' + (rows || '<tr><td colspan="5" style="padding:24px;text-align:center;color:#aaa">Nenhuma candidatura encontrada.</td></tr>') + '</tbody></table>' +
            '<div class="footer"><span>LinkUp</span><span>' + req.user.email + '</span></div>' +
            '</body></html>';

        const pdfBuffer = await generatePdf(html);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="candidaturas-' + req.user.name.replace(/\s+/g, '-').toLowerCase() + '.pdf"');
        res.send(pdfBuffer);
    } catch (err) {
        req.flash('error_msg', 'Erro ao gerar PDF.');
        res.redirect('/jobs/my-applications');
    }
};

/*
 * POST /jobs/cancel/:applicationId // Permite ao candidato cancelar uma candidatura com status 'pendente'.
 */
exports.cancelApplication = async (req, res) => {
    try {
        const applicationId = parseInt(req.params.applicationId, 10);
        if (!applicationId) return res.status(400).json({ ok: false, error: 'ID inválido.' });

        const application = await Application.findOne({
            where: { id: applicationId, userId: req.user.id }
        });
        if (!application) {
            return res.status(404).json({ ok: false, error: 'Candidatura não encontrada.' });
        }

        const job = await Job.findByPk(application.jobId);
        if (!job) {
            return res.status(404).json({ ok: false, error: 'Vaga não encontrada.' });
        }

        await cancelApplication({ application, user: req.user, job, expressApp: req.app });

        logger.info('jobsController', 'Candidatura cancelada pelo candidato', {
            applicationId, userId: req.user.id, jobId: job.id
        });
        return res.json({ ok: true });
    } catch (err) {
        logger.error('jobsController', 'Erro ao cancelar candidatura', { err: err.message });
        return res.status(400).json({ ok: false, error: err.message || 'Erro ao cancelar candidatura.' });
    }
};

exports.toggleFavorite = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await Favorite.findOne({ where: { userId: req.user.id, jobId: id } });
        if (existing) { await existing.destroy(); req.flash('success_msg', 'Vaga removida dos favoritos.'); }
        else { await Favorite.create({ userId: req.user.id, jobId: id }); req.flash('success_msg', 'Vaga salva nos favoritos!'); }
        res.redirect('/jobs/view/' + id);
    } catch (err) {
        req.flash('error_msg', 'Erro ao favoritar vaga.');
        res.redirect('/jobs/view/' + req.params.id);
    }
};

exports.favorites = async (req, res) => {
    try {
        const favorites = await Favorite.findAll({
            where:   { userId: req.user.id },
            include: [{ model: Job, as: 'job' }],
            order:   [['createdAt', 'DESC']]
        });
        res.render('favorites', { favorites: favorites.filter(f => f.job).map(f => f.toJSON()) });
    } catch (err) {
        req.flash('error_msg', 'Erro ao carregar favoritos.');
        res.redirect('/');
    }
};

exports.blockCompany = async (req, res) => {
    const safeBack = () => {
        const ref  = req.headers.referer || '';
        const base = process.env.BASE_URL || ('http://localhost:' + (process.env.PORT || 3000));
        return ref.startsWith(base) ? ref : '/';
    };
    try {
        if (req.user.userType !== 'candidato') return res.status(403).json({ error: 'Apenas candidatos podem bloquear empresas.' });
        const companyId = parseInt(req.params.companyId, 10);
        if (isNaN(companyId)) return res.status(400).json({ error: 'ID inválido.' });
        const existing  = await UserBlock.findOne({ where: { userId: req.user.id, companyId } });
        if (existing) { await existing.destroy(); req.flash('success_msg', 'Empresa desbloqueada.'); }
        else { await UserBlock.create({ userId: req.user.id, companyId }); req.flash('success_msg', 'Empresa bloqueada. Suas vagas não aparecerão mais para você.'); }
        res.redirect(safeBack());
    } catch (err) {
        req.flash('error_msg', 'Erro ao bloquear empresa.');
        res.redirect(safeBack());
    }
};

exports.coverLetter = async (req, res) => {
    const start = Date.now();
    try {
        const [job, resume] = await Promise.all([
            Job.findByPk(parseInt(req.params.id, 10)),
            Resume.findOne({ where: { userId: req.user.id } })
        ]);
        if (!job)    return res.json({ error: 'Vaga não encontrada.' });
        if (!resume) return res.json({ error: 'Você precisa ter um currículo cadastrado.' });

        const letter = await chatComplete(
            [{ role: 'user', content: 'Você é um assistente especialista em recrutamento. Gere uma carta de apresentação profissional em português brasileiro.\n\nCANDIDATO:\n- Nome: ' + req.user.name + '\n- Resumo: ' + (resume.summary || 'Não informado') + '\n- Habilidades: ' + (resume.skills || 'Não informado') + '\n- Experiências: ' + (resume.experiences || 'Não informado') + '\n- Formação: ' + (resume.education || 'Não informado') + '\n\nVAGA:\n- Título: ' + job.title + '\n- Empresa: ' + job.company + '\n- Descrição: ' + job.description + '\n- Requisitos: ' + (job.requirements || 'Não informado') + '\n\nINSTRUÇÕES:\n- Tom profissional mas natural, sem clichês\n- 3 a 4 parágrafos curtos\n- Destaque como as habilidades se encaixam na vaga\n- Não invente informações\n- Comece com "Prezados(as)," e termine com "Atenciosamente,"\n- Não inclua data, endereço nem linha de assunto' }],
            { max_tokens: 600, temperature: 0.7 }
        );
        if (!letter) return res.json({ error: 'A IA não retornou uma resposta.' });

        await logAi(req.user.id, 'cover-letter', start, true);
        res.json({ letter });
    } catch (err) {
        await logAi(req.user?.id, 'cover-letter', start, false);
        res.json({ error: 'Erro ao gerar a carta.' });
    }
};

exports.suggestStages = async (req, res) => {
    const start = Date.now();
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Título da vaga é obrigatório.' });
    try {
        const prompt = `Você é especialista em processos seletivos. Baseado na vaga abaixo, sugira de 4 a 6 etapas do processo seletivo em ordem lógica.\nRetorne APENAS um JSON válido no formato: {"stages":["Etapa 1","Etapa 2",...]}. Nenhum texto adicional.\n\nVaga: ${title}\n${description ? 'Descrição: ' + description.slice(0, 600) : ''}`;
        const raw = await chatComplete([{ role: 'user', content: prompt }], { max_tokens: 200 });
        const match = raw.match(/\{[\s\S]*?\}/);
        const parsed = match ? JSON.parse(match[0]) : null;
        await logAi(req.user.id, 'suggest-stages', start, true);
        res.json({ stages: parsed?.stages || ['Triagem de Currículo', 'Entrevista RH', 'Entrevista Técnica', 'Proposta'] });
    } catch (err) {
        await logAi(req.user?.id, 'suggest-stages', start, false);
        res.json({ stages: ['Triagem de Currículo', 'Entrevista RH', 'Entrevista Técnica', 'Proposta'] });
    }
};

exports.improveJob = async (req, res) => {
    const start = Date.now();
    const { fieldLabel, content, title } = req.body;
    if (!content) return res.status(400).json({ error: 'Conteúdo vazio.' });
    try {
        const improved = await chatComplete(
            [{ role: 'user', content: 'Você é um especialista em recrutamento e redação de vagas de emprego.\nMelhore o texto abaixo que é o campo "' + fieldLabel + '" da vaga "' + (title || 'não informado') + '".\nDeixe o texto mais profissional, claro e atrativo para candidatos.\nMantenha o mesmo idioma (português brasileiro).\nRetorne APENAS o texto melhorado, sem explicações, sem introdução, sem aspas, sem markdown, sem asteriscos, sem negrito — texto puro.\n\nTexto original:\n' + content }],
            { max_tokens: 1024 }
        );
        await logAi(req.user.id, 'improve-job', start, true);
        res.json({ improved });
    } catch (err) {
        await logAi(req.user?.id, 'improve-job', start, false);
        res.status(500).json({ error: 'Erro ao conectar com a IA.' });
    }
};

exports.compatibility = async (req, res) => {
    const start = Date.now();
    if (req.user.userType !== 'candidato') return res.status(403).json({ error: 'Apenas candidatos podem verificar compatibilidade.' });
    try {
        const jobId = parseInt(req.params.jobId, 10);
        const [job, resume] = await Promise.all([
            Job.findByPk(jobId),
            Resume.findOne({ where: { userId: req.user.id } })
        ]);
        if (!job)    return res.status(404).json({ error: 'Vaga não encontrada.' });
        if (!resume) return res.status(400).json({ error: 'Você precisa criar seu currículo antes de verificar compatibilidade.' });

        const cached = getFromCache('compatibility', jobId, req.user.id);
        if (cached) { await logAi(req.user.id, 'compatibility', start, true); return res.json(cached); }

        const { skills, experiences, education } = parseResume(resume);
        const text = (await chatComplete(
            [{ role: 'user', content: 'Você é um consultor de carreira experiente. Analise as chances reais deste candidato nesta vaga e fale DIRETAMENTE com ele, na segunda pessoa.\n\nPERFIL DO CANDIDATO:\nNome: ' + req.user.name + '\nResumo: ' + (resume.summary || 'Não informado') + '\nHabilidades: ' + (skills.join(', ') || 'Não informadas') + '\nExperiências: ' + (experiences.map(e => e.role + ' na ' + e.company).join('; ') || 'Não informadas') + '\nFormação: ' + (education.map(e => e.course + ' em ' + e.institution).join('; ') || 'Não informada') + '\n\nVAGA:\nVaga: ' + job.title + '\nDescrição: ' + (job.description || '') + '\nRequisitos: ' + (job.requirements || 'Não informados') + '\nDiferencial: ' + (job.differential || 'Não informado') + '\n\nSeja honesto e construtivo. Responda APENAS em JSON válido:\n{\n  "score": <0 a 100>,\n  "analysis": "<fale diretamente com o candidato>"\n}' }],
            { max_tokens: 1024 }
        )) || '{}';

        let parsed;
        try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
        catch { const sm = text.match(/"score"\s*:\s*(\d+)/), am = text.match(/"analysis"\s*:\s*"([\s\S]*?)"\s*\}/); parsed = sm ? { score: parseInt(sm[1]), analysis: am ? am[1].replace(/\\n/g, '\n') : text } : { score: 0, analysis: 'Não foi possível analisar.' }; }

        setInCache('compatibility', parsed, jobId, req.user.id);
        await logAi(req.user.id, 'compatibility', start, true);
        res.json(parsed);
    } catch (err) {
        await logAi(req.user?.id, 'compatibility', start, false);
        res.status(500).json({ error: 'Erro ao conectar com a IA.' });
    }
};

exports.rank = async (req, res) => {
    const start = Date.now();
    try {
        const job = await Job.findByPk(parseInt(req.params.jobId, 10));
        if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
        if (job.UserId !== req.user.id) return res.status(403).json({ error: 'Sem permissão.' });

        const applications = await Application.findAll({
            where:   { jobId: job.id },
            include: [{ model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'city'] }]
        });
        if (applications.length === 0) return res.json({ rankings: [] });

        const rankUserIds   = applications.map(a => a.userId);
        const rankResumes   = await Resume.findAll({ where: { userId: { [Op.in]: rankUserIds } } });
        const rankResumeMap = Object.fromEntries(rankResumes.map(r => [r.userId, r]));

        const candidates = applications.map(app => {
            const { skills, experiences, education, summary } = parseResume(rankResumeMap[app.userId]);
            return {
                applicationId: app.id,
                name:          app.candidate.name,
                summary,
                skills:        skills.join(', ') || 'Não informadas',
                experiences:   experiences.map(e => e.role + ' na ' + e.company).join('; ') || 'Não informadas',
                education:     education.map(e => e.course + ' em ' + e.institution).join('; ') || 'Não informada'
            };
        });

        const candidatesText = candidates.map((c, i) =>
            'Candidato ' + (i + 1) + ' (ID: ' + c.applicationId + '):\n' +
            '  Nome: ' + c.name + '\n  Resumo: ' + c.summary + '\n' +
            '  Habilidades: ' + c.skills + '\n  Experiências: ' + c.experiences + '\n' +
            '  Formação: ' + c.education
        ).join('\n\n');

        const text = (await chatComplete(
            [{ role: 'user', content: 'Você é um recrutador especialista. Analise os candidatos para a vaga e gere um ranking.\n\nVAGA:\nTítulo: ' + job.title + '\nRequisitos: ' + (job.requirements || 'Não informados') + '\n\nCANDIDATOS:\n' + candidatesText + '\n\nResponda APENAS em JSON:\n{\n  "rankings": [\n    { "applicationId": <número>, "score": <0 a 100>, "analysis": "<2-3 frases>" }\n  ]\n}' }],
            { max_tokens: 1500 }
        )) || '{}';

        let parsed;
        try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
        catch { const match = text.match(/\{[\s\S]*\}/); parsed = match ? JSON.parse(match[0]) : { rankings: [] }; }

        await logAi(req.user.id, 'ranking', start, true);
        res.json(parsed);
    } catch (err) {
        await logAi(req.user?.id, 'ranking', start, false);
        res.status(500).json({ error: 'Erro ao conectar com a IA.' });
    }
};

exports.compareCandidates = async (req, res) => {
    const start = Date.now();
    try {
        const { applicationIds, jobId } = req.body;
        if (!applicationIds || applicationIds.length < 2 || applicationIds.length > 3) {
            return res.status(400).json({ error: 'Selecione 2 ou 3 candidatos.' });
        }

        const job = await Job.findByPk(jobId);
        if (!job || job.UserId !== req.user.id) return res.status(403).json({ error: 'Sem permissão.' });

        const applications = await Application.findAll({
            where:   { id: applicationIds },
            include: [{ model: User, as: 'candidate', attributes: ['id', 'name'] }]
        });

        const cmpUserIds   = applications.map(a => a.userId);
        const cmpResumes   = await Resume.findAll({ where: { userId: { [Op.in]: cmpUserIds } } });
        const cmpResumeMap = Object.fromEntries(cmpResumes.map(r => [r.userId, r]));

        const candidatesData = applications.map(app => {
            const { skills, experiences: exps, summary } = parseResume(cmpResumeMap[app.userId]);
            return {
                nome:         app.candidate?.name || 'Candidato',
                skills:       skills.join(', '),
                resumo:       summary,
                experiencias: exps.map(e => e.role + ' na ' + e.company).join(', '),
                answersScore: app.answersScore
            };
        });

        const candidatesText = candidatesData.map((c, i) =>
            'CANDIDATO ' + (i + 1) + ': ' + c.nome +
            '\nSkills: ' + c.skills +
            '\nExperiências: ' + c.experiencias +
            '\nResumo: ' + c.resumo +
            (c.answersScore ? '\nScore Teste: ' + c.answersScore + '/100' : '')
        ).join('\n\n---\n\n');

        const raw = (await chatComplete(
            [{ role: 'user', content: 'Compare os candidatos para a vaga de ' + job.title + '.\n\nVAGA:\nTítulo: ' + job.title + '\nRequisitos: ' + (job.requirements || 'Não informados') + '\n\n' + candidatesText + '\n\nRetorne APENAS este JSON:\n{\n  "candidates": [\n    {\n      "nome": "nome",\n      "score": 0-100,\n      "recomendado": true/false,\n      "analise": "2 linhas",\n      "pontos_fortes": ["ponto1"],\n      "lacunas": ["lacuna1"]\n    }\n  ],\n  "conclusao": "2 linhas"\n}' }],
            { max_tokens: 800, temperature: 0.3 }
        )).replace(/```json|```/g, '');

        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'Erro ao processar comparação.' });

        await logAi(req.user.id, 'compare-candidates', start, true);
        res.json(JSON.parse(match[0]));
    } catch (err) {
        await logAi(req.user?.id, 'compare-candidates', start, false);
        res.status(500).json({ error: 'Erro ao comparar candidatos.' });
    }
};

exports.getTalents = async (req, res) => {
    try {
        const job     = await Job.findByPk(parseInt(req.params.id, 10), { attributes: ['id', 'UserId', 'rediscoveryData'] });
        if (!job || job.UserId !== req.user.id) return res.json({ talents: [] });
        const talents = job.rediscoveryData ? JSON.parse(job.rediscoveryData) : [];
        res.json({ talents });
    } catch (e) {
        res.json({ talents: [] });
    }
};

exports.reactivateContact = async (req, res) => {
    const jobId       = parseInt(req.params.jobId,       10);
    const candidateId = parseInt(req.params.candidateId, 10);

    const { ok, error } = await _reactivateContact(jobId, candidateId, req.user.id, req.app);

    if (!ok) {
        req.flash('error_msg', error || 'Erro ao reativar contato.');
    } else {
        req.flash('success_msg', 'Contato reativado! O candidato foi notificado.');
    }
    res.redirect('/jobs/applications/' + jobId);
};

// ── Etapas do processo seletivo ───────────────────────────────────────────────

exports.updateStage = async (req, res) => {
    const { applicationId, stageName, jobId } = req.body;
    try {
        if (!stageName) {
            req.flash('error_msg', 'Selecione uma etapa antes de avançar.');
            return res.redirect('/jobs/applications/' + jobId);
        }

        const application = await Application.findByPk(parseInt(applicationId, 10));
        if (!application) { req.flash('error_msg', 'Candidatura não encontrada.'); return res.redirect('/jobs/applications/' + jobId); }

        const job = await Job.findByPk(application.jobId);
        if (!job || job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão.'); return res.redirect('/jobs/applications/' + jobId); }

        await updateApplicationStage({ application, stageName, expressApp: req.app });
        req.flash('success_msg', 'Candidato avançado para a etapa "' + stageName + '"!');
        res.redirect('/jobs/applications/' + jobId);
    } catch (err) {
        logger.error('jobsController', 'Erro ao atualizar etapa', { err: err.message });
        req.flash('error_msg', 'Erro ao atualizar etapa.');
        res.redirect('/jobs/applications/' + (jobId || ''));
    }
};

exports.closeJobWithFeedback = async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    try {
        const job = await Job.findByPk(jobId);
        if (!job) { req.flash('error_msg', 'Vaga não encontrada.'); return res.redirect('/'); }
        if (job.UserId !== req.user.id) { req.flash('error_msg', 'Sem permissão.'); return res.redirect('/'); }

        await job.update({ status: 'encerrada' });
        req.flash('success_msg', 'Vaga encerrada. Feedbacks sendo enviados para os candidatos não selecionados.');
        res.redirect('/jobs/applications/' + jobId);

        // Fire-and-forget: envia feedbacks sem bloquear a resposta
        sendBulkClosingFeedback(job).catch(() => {});
    } catch (err) {
        req.flash('error_msg', 'Erro ao encerrar vaga.');
        res.redirect('/jobs/applications/' + jobId);
    }
};

// ── Candidatos similares 

exports.getSimilarCandidates = async (req, res) => {
    const applicationId = parseInt(req.params.id, 10);
    try {
        const target = await Application.findByPk(applicationId);
        if (!target) return res.json({ similar: [] });

        const job = await Job.findByPk(target.jobId);
        if (!job || job.UserId !== req.user.id) return res.status(403).json({ error: 'Sem permissão.' });

        const similar = await findCandidatesSimilarTo(target.userId, job.id, req.user.id);
        res.json({ similar });
    } catch (e) {
        logger.error('jobsController', 'Erro ao buscar similares', { err: e.message });
        res.json({ similar: [] });
    }
};

// ── Candidatos Sugeridos (não candidatos com alto fit) 

exports.getSuggestedCandidates = async (req, res) => {
    const jobId = parseInt(req.params.jobId, 10);
    try {
        const suggested = await findSuggestedCandidates(jobId, req.user.id);
        res.json({ suggested });
    } catch (e) {
        logger.error('jobsController', 'Erro ao buscar sugeridos', { err: e.message });
        res.json({ suggested: [] });
    }
};

exports.contactSuggested = async (req, res) => {
    const jobId       = parseInt(req.params.jobId,       10);
    const candidateId = parseInt(req.params.candidateId, 10);
    const { ok, error } = await contactSuggestedCandidate(jobId, candidateId, req.user.id, req.app);
    res.json({ ok, error: error || null });
};

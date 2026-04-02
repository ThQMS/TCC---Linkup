const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const logger   = require('../helpers/logger');
const { generatePdf } = require('../helpers/pdfService');
const { Op }   = require('sequelize');
const { User, Job, Resume, Application, Notification } = require('../models');
const parseResume = require('../helpers/parseResume');
const { formatDate, jobStatusBadge } = require('../helpers/pdfUtils');
const { auditLog } = require('../middleware/auditLog');

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
const { calcularMetricas }    = require('../services/responsividadeService');
const { getChecklistStatus }  = require('../services/onboardingService');
const { setAvailability, STATUS: AVAIL_STATUS } = require('../services/availabilityService');

const IMAGE_MAGIC_BYTES = {
    jpeg: [Buffer.from([0xFF, 0xD8, 0xFF])],
    png:  [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
    webp: [Buffer.from([0x52, 0x49, 0x46, 0x46])]
};
const MIME_TO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function validateImageMagicBytes(buffer, mimetype) {
    const type = mimetype.split('/')[1] === 'jpeg' ? 'jpeg' : mimetype.split('/')[1];
    const signatures = IMAGE_MAGIC_BYTES[type];
    if (!signatures) return false;
    return signatures.some(sig => buffer.slice(0, sig.length).equals(sig));
}

function sanitizeForJson(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/</g, '\u003c').replace(/>/g, '\u003e').replace(/&/g, '\u0026');
}

function buildJobsData(jobs, allApps) {
    const jobIds    = jobs.map(j => j.id);
    const appsByJob = jobIds.reduce((acc, id) => {
        acc[id] = allApps.filter(a => a.jobId === id);
        return acc;
    }, {});

    const jobsData = jobs.map(job => {
        const apps = appsByJob[job.id] || [];
        return {
            ...job.toJSON(),
            total:     apps.length,
            aprovado:  apps.filter(a => a.status === 'aprovado').length,
            rejeitado: apps.filter(a => a.status === 'rejeitado').length,
            expirado:  apps.filter(a => a.status === 'expirado').length,
            pendente:  apps.filter(a => !a.status || a.status === 'pendente').length
        };
    });

    return {
        jobsData,
        totalCandidaturas: jobsData.reduce((s, j) => s + j.total, 0),
        totalAprovados:    jobsData.reduce((s, j) => s + j.aprovado, 0),
        totalRejeitados:   jobsData.reduce((s, j) => s + j.rejeitado, 0),
        totalPendentes:    jobsData.reduce((s, j) => s + j.pendente, 0),
        totalExpirados:    jobsData.reduce((s, j) => s + j.expirado, 0)
    };
}

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const memberDays = Math.floor((new Date() - new Date(user.createdAt)) / 86400000);
        let myJobs = [], jobsCount = 0, applicationsCount = 0;
        if (user.userType === 'empresa') {
            myJobs    = await Job.findAll({ where: { UserId: user.id }, order: [['createdAt', 'DESC']], limit: 10 });
            jobsCount = await Job.count({ where: { UserId: user.id } });
            myJobs    = myJobs.map(j => j.toJSON());
            const jobIds = myJobs.map(j => j.id);
            applicationsCount = jobIds.length > 0 ? await Application.count({ where: { jobId: jobIds } }) : 0;
        } else {
            applicationsCount = await Application.count({ where: { userId: user.id } });
        }
        const [resume, checklist] = await Promise.all([
            Resume.findOne({ where: { userId: user.id } }),
            getChecklistStatus(user.toJSON())
        ]);
        const view = user.userType === 'empresa' ? 'profile-empresa' : 'profile-candidato';
        res.render(view, { user: user.toJSON(), memberDays, jobsCount, applicationsCount, myJobs, hasCurriculo: !!resume, checklist, csrfToken: res.locals.csrfToken });
    } catch (err) {
        logger.error('profileController', 'Erro ao carregar perfil', { err: err.message });
        req.flash('error_msg', 'Erro ao carregar perfil.');
        res.redirect('/');
    }
};

exports.getMyJobs = async (req, res) => {
    try {
        if (req.user.userType !== 'empresa') return res.redirect('/profile');
        const jobs = await Job.findAll({ where: { UserId: req.user.id }, order: [['createdAt', 'DESC']] });
        const jobIds = jobs.map(j => j.id);
        const apps = jobIds.length > 0
            ? await Application.findAll({ where: { jobId: jobIds }, attributes: ['jobId', 'status'] })
            : [];
        const appMap = {};
        for (const a of apps) {
            if (!appMap[a.jobId]) appMap[a.jobId] = { total: 0, pendentes: 0, aprovados: 0 };
            appMap[a.jobId].total++;
            if (['pendente', 'em análise'].includes(a.status)) appMap[a.jobId].pendentes++;
            if (['aprovado', 'contratado'].includes(a.status))  appMap[a.jobId].aprovados++;
        }
        const jobsData = jobs.map(j => ({
            ...j.toJSON(),
            totalApps: (appMap[j.id] || {}).total     || 0,
            pendentes: (appMap[j.id] || {}).pendentes || 0,
            aprovados: (appMap[j.id] || {}).aprovados || 0
        }));
        res.render('my-jobs', { jobs: jobsData, csrfToken: res.locals.csrfToken });
    } catch (err) {
        logger.error('profileController', 'Erro ao carregar minhas vagas', { err: err.message });
        req.flash('error_msg', 'Erro ao carregar vagas.');
        res.redirect('/profile');
    }
};

exports.getDashboard = async (req, res) => {
    try {
        if (req.user.userType !== 'empresa') return res.redirect('/profile');

        const user = await User.findByPk(req.user.id);
        const jobs = await Job.findAll({ where: { UserId: req.user.id }, order: [['createdAt', 'DESC']], limit: 100 });

        const jobIds      = jobs.map(j => j.id);
        const todasAppsDb = await Application.findAll({
            where: { jobId: { [Op.in]: jobIds.length > 0 ? jobIds : [0] } }
        });

        const { jobsData, totalCandidaturas, totalAprovados, totalPendentes, totalRejeitados, totalExpirados } = buildJobsData(jobs, todasAppsDb);

        const { taxaResposta, tempoMedio: tempoMedioResposta, empresaResponsiva } = calcularMetricas(todasAppsDb);

        const jobLinks = jobIds.map(id => `/jobs/view/${id}`);
        const [talentosRedescobertos, similarContatados] = await Promise.all([
            Notification.count({
                where: {
                    link:    { [Op.in]: jobLinks.length > 0 ? jobLinks : ['__none__'] },
                    message: { [Op.like]: '%quer reconectar%' }
                }
            }),
            Notification.count({
                where: {
                    type: 'similar_invite',
                    link: { [Op.in]: jobLinks.length > 0 ? jobLinks : ['__none__'] }
                }
            })
        ]);

        const checklist = await getChecklistStatus(user.toJSON());

        res.render('dashboard', {
            user: user.toJSON(),
            checklist,
            jobsData,
            jobsCount:          jobs.length,
            totalCandidaturas,
            totalAceitos:       totalAprovados,
            totalPendentes,
            totalRejeitados,
            totalExpirados,
            taxaResposta,
            tempoMedioResposta,
            empresaResponsiva,
            talentosRedescobertos,
            similarContatados,
            chartData: JSON.stringify(jobsData.map(j => ({
                title:     sanitizeForJson(j.title),
                total:     j.total,
                aprovado:  j.aprovado,
                rejeitado: j.rejeitado,
                pendente:  j.pendente,
                expirado:  j.expirado
            })))
        });
    } catch (err) {
        logger.error('profileController', 'Erro ao carregar dashboard', { err: err.message });
        req.flash('error_msg', 'Erro ao carregar dashboard.');
        res.redirect('/profile');
    }
};

exports.getDashboardPdf = async (req, res) => {
    try {
        const jobs   = await Job.findAll({ where: { UserId: req.user.id }, order: [['createdAt', 'DESC']] });
        const jobIds  = jobs.map(j => j.id);
        const allApps = await Application.findAll({
            where: { jobId: { [Op.in]: jobIds.length > 0 ? jobIds : [0] } },
            attributes: ['jobId', 'status', 'createdAt', 'updatedAt']
        });

        const { jobsData, totalCandidaturas, totalAprovados, totalRejeitados, totalPendentes, totalExpirados } = buildJobsData(jobs, allApps);
        const { taxaResposta } = calcularMetricas(allApps);

        const rows = jobsData.map(j => '<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;"><p style="font-weight:700;margin:0 0 2px;">' + sanitizeForJson(j.title) + '</p><p style="margin:0;color:#888;font-size:.8rem;">' + (j.modality || '—') + '</p></td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;">' + jobStatusBadge(j.status) + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;">' + j.total + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#2e7d32;font-weight:700;">' + j.aprovado + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#f57f17;font-weight:700;">' + j.pendente + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#c62828;font-weight:700;">' + j.rejeitado + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#888;font-weight:700;">' + j.expirado + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#888;">' + (j.views || 0) + '</td><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#888;font-size:.8rem;">' + formatDate(j.createdAt) + '</td></tr>').join('');

        const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#333;background:white;padding:32px}.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #e53935;margin-bottom:28px}.header-logo{font-size:1.6rem;font-weight:800}.header-logo span{color:#e53935}.summary{display:flex;gap:12px;margin-bottom:28px}.summary-card{flex:1;border:1px solid #eee;border-radius:10px;padding:14px;text-align:center}.summary-card .num{font-size:1.8rem;font-weight:800}.summary-card .label{font-size:.72rem;color:#888;margin-top:4px}.c-total .num{color:#333}.c-aprovado .num{color:#2e7d32}.c-rejeitado .num{color:#c62828}.c-pendente .num{color:#f57f17}.c-vagas .num{color:#e53935}.c-taxa .num{color:#1976d2}.section-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#e53935;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:.85rem}thead tr{background:#e53935}thead th{padding:10px 16px;color:white;font-size:.78rem;font-weight:700;text-align:center}thead th:first-child{text-align:left}tbody tr:nth-child(even){background:#fafafa}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:.75rem;color:#aaa}</style></head><body><div class="header"><div class="header-logo">Link<span>Up</span></div><div style="text-align:right;font-size:.8rem;color:#888;"><strong style="display:block;font-size:1rem;color:#333;">' + escapeHtml(req.user.name) + '</strong>Relatório gerado em ' + formatDate(new Date()) + '</div></div><div class="summary"><div class="summary-card c-vagas"><div class="num">' + jobs.length + '</div><div class="label">Vagas</div></div><div class="summary-card c-total"><div class="num">' + totalCandidaturas + '</div><div class="label">Total candidaturas</div></div><div class="summary-card c-aprovado"><div class="num">' + totalAprovados + '</div><div class="label">Aprovados</div></div><div class="summary-card c-pendente"><div class="num">' + totalPendentes + '</div><div class="label">Pendentes</div></div><div class="summary-card c-rejeitado"><div class="num">' + totalRejeitados + '</div><div class="label">Rejeitados</div></div><div class="summary-card c-taxa"><div class="num">' + taxaResposta + '%</div><div class="label">Taxa de resposta</div></div></div><p class="section-title">Detalhamento por vaga</p><table><thead><tr><th style="text-align:left;">Vaga</th><th>Status</th><th>Total</th><th>Aprovados</th><th>Pendentes</th><th>Rejeitados</th><th>Expirados</th><th>Views</th><th>Criada em</th></tr></thead><tbody>' + (rows || '<tr><td colspan="9" style="padding:24px;text-align:center;color:#aaa;">Nenhuma vaga.</td></tr>') + '</tbody></table><div class="footer"><span>LinkUp — Plataforma de Recrutamento Inteligente</span><span>' + req.user.email + '</span></div></body></html>';

        const pdfBuffer = await generatePdf(html);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="relatorio-' + req.user.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '.pdf"');
        res.send(pdfBuffer);
    } catch (err) {
        logger.error('profileController', 'Erro ao gerar PDF do dashboard', { err: err.message });
        req.flash('error_msg', 'Erro ao gerar relatório PDF.');
        res.redirect('/profile/dashboard');
    }
};

// Campos públicos de empresa — nunca expor password, tokens, cnpj, phone, address
const EMPRESA_PUBLIC_FIELDS = ['id', 'name', 'avatar', 'bio', 'city', 'sector', 'companySize', 'website', 'linkedinCompany', 'userType'];

exports.getEmpresaPublica = async (req, res) => {
    try {
        const empresa = await User.findOne({
            where: { id: parseInt(req.params.id, 10), userType: 'empresa' },
            attributes: EMPRESA_PUBLIC_FIELDS
        });
        if (!empresa) { req.flash('error_msg', 'Empresa não encontrada.'); return res.redirect('/'); }

        const jobs = await Job.findAll({ where: { UserId: empresa.id, status: 'aberta' }, order: [['createdAt', 'DESC']], limit: 50 });
        const vagasIds = jobs.map(j => j.id);

        // Calcula métricas de responsividade para o selo público
        let empresaResponsiva = false;
        if (vagasIds.length > 0) {
            const todasApps = await Application.findAll({
                where: { jobId: { [Op.in]: vagasIds } },
                attributes: ['status', 'createdAt', 'updatedAt']
            });
            ({ empresaResponsiva } = calcularMetricas(todasApps));
        }

        res.render('empresa-publica', {
            empresa: empresa.toJSON(),
            jobs: jobs.map(j => j.toJSON()),
            jobsCount: jobs.length,
            empresaResponsiva
        });
    } catch (err) {
        logger.error('profileController', 'Erro ao carregar perfil empresa pública', { err: err.message });
        res.redirect('/');
    }
};

exports.postAvatar = async (req, res) => {
    try {
        if (!req.file) { req.flash('error_msg', 'Nenhuma imagem enviada.'); return res.redirect('/profile'); }
        if (!validateImageMagicBytes(req.file.buffer || Buffer.alloc(0), req.file.mimetype)) {
            req.flash('error_msg', 'Arquivo de imagem inválido.');
            return res.redirect('/profile');
        }
        const user = await User.findByPk(req.user.id);
        if (user.avatar) { const old = './public' + user.avatar; if (fs.existsSync(old)) fs.unlinkSync(old); }
        const ext      = MIME_TO_EXT[req.file.mimetype] || '.jpg';
        const filename = 'avatar-' + crypto.randomBytes(16).toString('hex') + ext;
        const dir      = './public/uploads/avatars';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dir + '/' + filename, req.file.buffer);
        user.avatar = '/uploads/avatars/' + filename;
        await user.save();
        auditLog('AVATAR_UPDATE', req);
        req.flash('success_msg', 'Foto de perfil atualizada!');
        res.redirect('/profile');
    } catch (err) {
        logger.error('profileController', 'Erro ao salvar avatar', { err: err.message });
        req.flash('error_msg', 'Erro ao salvar foto. Tente novamente.');
        res.redirect('/profile');
    }
};

exports.postUpdate = async (req, res) => {
    const { name, bio, city, github, linkedin, website, linkedinCompany, sector, companySize, phone, birthDate, address, isPcd, pcdType } = req.body;
    try {
        const user = await User.findByPk(req.user.id);
        user.name      = name;
        user.bio       = bio;
        user.city      = city;
        user.phone     = phone     || null;
        user.birthDate = birthDate || null;
        user.address   = address   || null;
        if (user.userType === 'candidato') {
            user.github   = github;
            user.linkedin = linkedin;
            user.isPcd    = isPcd === '1';
            user.pcdType  = user.isPcd ? (pcdType || null) : null;
        } else {
            user.website         = website;
            user.linkedinCompany = linkedinCompany;
            user.sector          = sector;
            user.companySize     = companySize;
        }
        await user.save();
        auditLog('PROFILE_UPDATE', req);
        req.flash('success_msg', 'Perfil atualizado com sucesso!');
        res.redirect('/profile');
    } catch (err) {
        logger.error('profileController', 'Erro ao atualizar perfil', { err: err.message });
        req.flash('error_msg', 'Erro ao salvar. Tente novamente.');
        res.redirect('/profile');
    }
};

exports.getCandidateDashboard = async (req, res) => {
    try {
        if (req.user.userType !== 'candidato') return res.redirect('/profile/dashboard');
        const applications = await Application.findAll({
            where: { userId: req.user.id },
            include: [{ model: Job, as: 'job' }],
            order: [['createdAt', 'DESC']]
        });
        const data = applications.map(a => a.toJSON());
        const user = await User.findByPk(req.user.id);
        const [resume, oportunidadesRevisitadas, checklist] = await Promise.all([
            Resume.findOne({ where: { userId: req.user.id } }),
            // Conta notificações de "Oportunidade Revisitada" recebidas pelo candidato
            Notification.count({
                where: {
                    userId:  req.user.id,
                    message: { [Op.like]: '%reabriu uma vaga parecida%' }
                }
            }),
            getChecklistStatus(user.toJSON())
        ]);
        res.render('dashboard-candidato', {
            applications: data,
            checklist,
            totalCandidaturas:     data.length,
            totalAceitos:          data.filter(a => a.status === 'aprovado' || a.status === 'contratado').length,
            totalRecusados:        data.filter(a => a.status === 'rejeitado' || a.status === 'expirado').length,
            totalPendentes:        data.filter(a => !a.status || a.status === 'pendente' || a.status === 'em análise').length,
            hasCurriculo:          !!resume,
            oportunidadesRevisitadas
        });
    } catch (err) {
        logger.error('profileController', 'Erro no dashboard candidato', { err: err.message });
        req.flash('error_msg', 'Erro ao carregar dashboard.');
        res.redirect('/profile');
    }
};

exports.postAvailabilityStatus = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || user.userType !== 'candidato') return res.status(403).json({ ok: false });

        const { status } = req.body;
        if (!status) return res.status(400).json({ ok: false, error: 'Status não informado.' });

        // Delega validação e persistência ao service (valida enum, sincroniza openToWork)
        await setAvailability(user.id, status);

        logger.info('profileController', 'Disponibilidade atualizada', { userId: user.id, status });
        res.json({ ok: true, availabilityStatus: status });
    } catch (err) {
        logger.error('profileController', 'Erro ao atualizar disponibilidade', { err: err.message });
        res.status(400).json({ ok: false, error: err.message || 'Erro ao atualizar status.' });
    }
};

// Campos públicos de candidato — nunca expor password, tokens, email, phone, birthDate, address
const CANDIDATO_PUBLIC_FIELDS = ['id', 'name', 'avatar', 'bio', 'city', 'github', 'linkedin', 'openToWork', 'availabilityStatus', 'userType'];

exports.getPublicCandidate = async (req, res) => {
    try {
        // Converte slug de URL para nome (ex: "ana-paula" → "ana paula")
        // Usa iLike para busca case-insensitive sem curingas — sem risco de LIKE injection
        const nameParam = req.params.name
            .replace(/-/g, ' ')
            .replace(/[^a-zA-ZÀ-úÀ-ÿ0-9\s]/g, '')
            .trim()
            .slice(0, 100);
        if (!nameParam) return res.status(404).render('404', { layout: false });
        const candidate = await User.findOne({
            where: { userType: 'candidato', name: { [Op.iLike]: nameParam } },
            attributes: CANDIDATO_PUBLIC_FIELDS
        });
        if (!candidate) return res.status(404).render('404', { layout: false });
        const resume = await Resume.findOne({ where: { userId: candidate.id } });
        if (!resume) return res.status(404).render('404', { layout: false });

        // Se a empresa veio de uma vaga específica, carrega os dados para o botão de contato
        let fromJob = null;
        const fromJobId = parseInt(req.query.fromJob, 10);
        if (!isNaN(fromJobId) && req.user && req.user.userType === 'empresa') {
            const job = await Job.findByPk(fromJobId, { attributes: ['id', 'title', 'company', 'UserId'] });
            if (job && job.UserId === req.user.id) {
                fromJob = { id: job.id, title: job.title, company: job.company };
            }
        }

        res.render('public-profile', {
            layout:    'main',
            candidate: candidate.toJSON(),
            resume:    { ...resume.toJSON(), ...parseResume(resume) },
            fromJob,
            csrfToken: res.locals.csrfToken
        });
    } catch (err) { res.status(500).render('500', { layout: false }); }
};

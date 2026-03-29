/**
 * talentRediscoveryService.js
 *
 * Núcleo das duas features simétricas de alto impacto:
 *
 *  → findTalentsForJob(job, companyUserId, app)
 *     Para EMPRESA: ao criar/reativar vaga, encontra candidatos com fit ≥ 88%
 *     que já candidataram nos últimos 6 meses na mesma empresa ou vagas similares.
 *
 *  → notifyRevisitedOpportunities(job, app)
 *     Para CANDIDATOS: ao surgir vaga nova/reativada, notifica candidatos disponíveis
 *     que já se candidataram antes nessa empresa e têm fit atual ≥ 88%.
 *
 *  → reactivateContact(jobId, candidateId, companyUserId, app)
 *     Chamado pelo botão "Reativar contato" — envia notificação + email ao candidato.
 */

const { Op }     = require('sequelize');
const { Job, User, Resume, Application, Notification } = require('../models');
const parseResume        = require('../helpers/parseResume');
const transporter        = require('../helpers/mailer');
const sendSocket         = require('../helpers/socket');
const logger             = require('../helpers/logger');
const { isAvailable }    = require('./availabilityService');

// ─── Constantes ────────────────────────────────────────────────────────────────

const FIT_THRESHOLD         = 88;   // % mínimo para acionar as features
const LOOKBACK_MONTHS       = 6;    // janela de busca de candidaturas antigas
const MAX_CANDIDATES_NOTIFY = 50;   // limite de candidatos processados por chamada

// ─── Fit Score ─────────────────────────────────────────────────────────────────

/**
 * Calcula o fit entre o currículo de um candidato e uma vaga.
 * Reutiliza a lógica de keyword matching já existente no projeto,
 * normalizando para 0-100.
 *
 * @param {object} resume - Instância Sequelize do currículo (resume-model)
 * @param {object} job    - Objeto plano ou instância Sequelize da vaga
 * @returns {number} fitScore de 0 a 100
 */
function calcFitScore(resume, job) {
    if (!resume) return 0;

    const { skills, experiences, education, summary } = parseResume(resume);

    // Extrai keywords do perfil do candidato (mesma lógica do getSuggestedJobs)
    const keywords = [
        ...skills,
        ...experiences.map(e => e.role   || ''),
        ...experiences.map(e => e.company || ''),
        ...education.map(e => e.course   || ''),
        summary || ''
    ]
        .join(' ')
        .toLowerCase()
        .split(/[\s,;\/\-\(\)]+/)
        .map(w => w.trim())
        .filter(w => w.length > 3);

    if (keywords.length === 0) return 0;

    const jobText = [
        job.title        || '',
        job.description  || '',
        job.requirements || '',
        job.benefits     || '',
        job.differential || ''
    ].join(' ').toLowerCase();

    const matched = keywords.filter(kw => jobText.includes(kw)).length;
    return Math.round((matched / keywords.length) * 100);
}

// ─── Feature 1: Redescoberta de Talentos (para Empresa) ───────────────────────

/**
 * Ao criar ou reativar uma vaga, verifica candidaturas antigas (últimos 6 meses)
 * da mesma empresa ou vagas similares e retorna candidatos com fit ≥ 88%.
 *
 * Retorna um array de { candidate, fitScore, lastApplicationDate, applicationId }
 * para que o controller possa passar ao template o alerta de redescoberta.
 *
 * @param {object} job           - Instância Sequelize da vaga recém-criada/reativada
 * @param {number} companyUserId - req.user.id da empresa
 * @returns {Promise<Array>}
 */
async function findTalentsForJob(job, companyUserId) {
    try {
        const since = _monthsAgo(LOOKBACK_MONTHS);

        // 1. Busca IDs de vagas da mesma empresa nos últimos 6 meses
        const companyJobs = await Job.findAll({
            where: {
                UserId:    companyUserId,
                createdAt: { [Op.gte]: since }
            },
            attributes: ['id', 'title']
        });
        const companyJobIds = companyJobs.map(j => j.id);

        // 2. Busca IDs de vagas similares pelo título (primeira palavra-chave)
        const titleKeyword = job.title.split(' ')[0];
        const similarJobs  = await Job.findAll({
            where: {
                id:        { [Op.notIn]: companyJobIds.length ? companyJobIds : [0] },
                title:     { [Op.like]: `%${titleKeyword}%` },
                createdAt: { [Op.gte]: since }
            },
            attributes: ['id'],
            limit: 20
        });
        const allRelevantJobIds = [...companyJobIds, ...similarJobs.map(j => j.id)];

        if (allRelevantJobIds.length === 0) return [];

        // 3. Candidaturas antigas para essas vagas
        const pastApplications = await Application.findAll({
            where: {
                jobId:     { [Op.in]: allRelevantJobIds },
                createdAt: { [Op.gte]: since }
            },
            attributes: ['id', 'userId', 'createdAt'],
            order:       [['createdAt', 'DESC']]
        });

        if (pastApplications.length === 0) return [];

        // 4. Deduplica por candidato (mantém a mais recente)
        const uniqueByCandidate = new Map();
        for (const app of pastApplications) {
            if (!uniqueByCandidate.has(app.userId)) {
                uniqueByCandidate.set(app.userId, app);
            }
        }

        // 5. Calcula fit e filtra ≥ threshold
        const results = [];
        for (const [candidateId, app] of uniqueByCandidate) {
            if (results.length >= MAX_CANDIDATES_NOTIFY) break;

            const [candidate, resume] = await Promise.all([
                User.findByPk(candidateId, { attributes: ['id', 'name', 'email', 'availabilityStatus', 'avatar'] }),
                Resume.findOne({ where: { userId: candidateId } })
            ]);

            // Só candidatos disponíveis
            if (!candidate || !isAvailable(candidate)) continue;

            const fitScore = calcFitScore(resume, job.toJSON ? job.toJSON() : job);
            if (fitScore < FIT_THRESHOLD) continue;

            results.push({
                candidate:           candidate.toJSON(),
                fitScore,
                lastApplicationDate: app.createdAt,
                applicationId:       app.id
            });
        }

        // Ordena pelo maior fit e persiste no banco
        const sorted = results.sort((a, b) => b.fitScore - a.fitScore);
        await job.update({ rediscoveryData: JSON.stringify(sorted) });

        return sorted;
    } catch (err) {
        logger.error('talentRediscoveryService', 'Erro em findTalentsForJob', { jobId: job.id, err: err.message });
        return [];
    }
}

// ─── Feature 2: Oportunidades Revisitadas (para Candidato) ────────────────────

/**
 * Ao surgir uma vaga nova ou reativada, notifica candidatos disponíveis
 * que já se candidataram antes nessa empresa e têm fit atual ≥ 88%.
 *
 * Executa silenciosamente (sem retorno significativo) — as notificações
 * são enviadas diretamente via Socket.io + email.
 *
 * @param {object} job        - Instância Sequelize da vaga nova/reativada
 * @param {object} expressApp - Para enviar notificações Socket.io
 */
async function notifyRevisitedOpportunities(job, expressApp) {
    try {
        const since = _monthsAgo(LOOKBACK_MONTHS);

        // 1. Busca outras vagas da mesma empresa (histórico)
        const companyPastJobs = await Job.findAll({
            where: {
                UserId: job.UserId,
                id:     { [Op.ne]: job.id },
                createdAt: { [Op.gte]: since }
            },
            attributes: ['id']
        });
        const pastJobIds = companyPastJobs.map(j => j.id);
        if (pastJobIds.length === 0) return;

        // 2. Candidatos que já aplicaram para essa empresa
        const pastApplications = await Application.findAll({
            where: {
                jobId:     { [Op.in]: pastJobIds },
                createdAt: { [Op.gte]: since }
            },
            attributes: ['userId', 'createdAt'],
            order:       [['createdAt', 'DESC']]
        });
        if (pastApplications.length === 0) return;

        // 3. Deduplica candidatos e registra data da candidatura mais recente
        const candidateMap = new Map();
        for (const app of pastApplications) {
            if (!candidateMap.has(app.userId)) {
                candidateMap.set(app.userId, app.createdAt);
            }
        }

        // 4. Processa cada candidato
        let notified = 0;
        for (const [candidateId, lastAppDate] of candidateMap) {
            if (notified >= MAX_CANDIDATES_NOTIFY) break;

            const [candidate, resume] = await Promise.all([
                User.findByPk(candidateId, { attributes: ['id', 'name', 'email', 'availabilityStatus'] }),
                Resume.findOne({ where: { userId: candidateId } })
            ]);

            if (!candidate || !isAvailable(candidate)) continue;

            const fitScore = calcFitScore(resume, job.toJSON ? job.toJSON() : job);
            if (fitScore < FIT_THRESHOLD) continue;

            const monthsAgo = _diffInMonths(lastAppDate);
            await _sendRevisitedOpportunityNotification({
                candidate,
                job:       job.toJSON ? job.toJSON() : job,
                fitScore,
                monthsAgo,
                expressApp
            });
            notified++;
        }

        if (notified > 0) {
            logger.info('talentRediscoveryService', 'Oportunidades revisitadas notificadas', { jobId: job.id, notified });
        }
    } catch (err) {
        logger.error('talentRediscoveryService', 'Erro em notifyRevisitedOpportunities', { jobId: job.id, err: err.message });
    }
}

// ─── Reativar Contato ─────────────────────────────────────────────────────────

/**
 * Chamado pelo botão "Reativar contato" no dashboard da empresa.
 * Envia notificação in-app + email ao candidato.
 *
 * @param {number} jobId         - ID da vaga
 * @param {number} candidateId   - ID do candidato a ser contatado
 * @param {number} companyUserId - ID da empresa (para validar ownership)
 * @param {object} expressApp
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function reactivateContact(jobId, candidateId, companyUserId, expressApp) {
    try {
        const [job, candidate] = await Promise.all([
            Job.findByPk(jobId,      { attributes: ['id', 'title', 'company', 'UserId'] }),
            User.findByPk(candidateId, { attributes: ['id', 'name', 'email'] })
        ]);

        if (!job)       return { ok: false, error: 'Vaga não encontrada' };
        if (!candidate) return { ok: false, error: 'Candidato não encontrado' };
        if (job.UserId !== companyUserId) return { ok: false, error: 'Sem permissão' };

        const message = `${job.company} tem interesse em você para a vaga "${job.title}". Quer recandidatar?`;
        const link    = `/jobs/view/${job.id}`;

        // Notificação in-app
        await Notification.create({ userId: candidateId, type: 'success', message, link });

        // Socket.io (tempo real, se online)
        sendSocket(expressApp, candidateId, {
            title:   `${job.company} quer te reconectar!`,
            message: `Você tem alto fit para a vaga "${job.title}". Quer recandidatar?`
        });

        // Email
        await transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      candidate.email,
            subject: `${job.company} tem uma vaga para você — LinkUp`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:auto;">
                    <h2 style="color:#e63946;">LinkUp</h2>
                    <p>Olá, <strong>${candidate.name}</strong>!</p>
                    <p>
                        A empresa <strong>${job.company}</strong> identificou que você tem
                        alto fit para a vaga <strong>"${job.title}"</strong> e quer
                        reativar o contato com você.
                    </p>
                    <a href="${process.env.BASE_URL}${link}"
                       style="display:inline-block;background:#e63946;color:white;padding:12px 24px;
                              border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
                        Ver vaga e recandidatar
                    </a>
                    <p style="color:#888;font-size:0.85rem;margin-top:24px;">
                        Você recebeu este email porque se candidatou anteriormente a vagas desta empresa.
                    </p>
                </div>
            `
        });

        logger.info('talentRediscoveryService', 'Contato reativado', { jobId, candidateId, companyUserId });
        return { ok: true };
    } catch (err) {
        logger.error('talentRediscoveryService', 'Erro em reactivateContact', { jobId, candidateId, err: err.message });
        return { ok: false, error: err.message };
    }
}

// ─── Helpers internos ──────────────────────────────────────────────────────────

function _monthsAgo(n) {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
}

function _diffInMonths(date) {
    const now    = new Date();
    const past   = new Date(date);
    const months = (now.getFullYear() - past.getFullYear()) * 12 + (now.getMonth() - past.getMonth());
    return Math.max(1, months);
}

async function _sendRevisitedOpportunityNotification({ candidate, job, fitScore, monthsAgo, expressApp }) {
    const message = `Uma empresa que você se candidatou há ${monthsAgo} mês(es) reabriu uma vaga parecida. Seu fit agora é ${fitScore}%. Quer recandidatar com 1 clique?`;
    const link    = `/jobs/view/${job.id}`;

    // Notificação in-app
    await Notification.create({ userId: candidate.id, type: 'info', message, link });

    // Socket.io
    sendSocket(expressApp, candidate.id, {
        title:   'Oportunidade revisitada!',
        message: `Seu fit para "${job.title}" (${job.company}) é ${fitScore}%. Quer recandidatar?`
    });

    // Email
    await transporter.sendMail({
        from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
        to:      candidate.email,
        subject: `Seu fit é ${fitScore}%! "${job.title}" em ${job.company} reabriu — LinkUp`,
        html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;">
                <h2 style="color:#e63946;">LinkUp</h2>
                <p>Olá, <strong>${candidate.name}</strong>!</p>
                <p>
                    Uma empresa que você se candidatou há <strong>${monthsAgo} mês(es)</strong>
                    reabriu uma vaga parecida. Seu fit atual é
                    <strong style="color:#e63946;">${fitScore}%</strong>.
                </p>
                <h3 style="margin:16px 0 4px;">${job.title}</h3>
                <p style="color:#666;margin:0 0 16px;">${job.company}${job.city ? ' · ' + job.city : ''}</p>
                <a href="${process.env.BASE_URL}${link}"
                   style="display:inline-block;background:#e63946;color:white;padding:12px 24px;
                          border-radius:8px;text-decoration:none;font-weight:600;">
                    Recandidatar com 1 clique
                </a>
                <p style="color:#888;font-size:0.85rem;margin-top:24px;">
                    Você recebeu este email porque está marcado como disponível no LinkUp.
                </p>
            </div>
        `
    }).catch(err => logger.warn('talentRediscoveryService', 'Falha ao enviar email revisitada', { candidateId: candidate.id, err: err.message }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Dado um candidato alvo em uma vaga, retorna os N candidatos mais similares
 * entre os outros candidantes da mesma vaga — baseado em fit score de skills.
 *
 * @param {object} targetApplication  - candidatura do candidato de referência (toJSON)
 * @param {object} job                - vaga (toJSON)
 * @param {Array}  allApplications    - todas as candidaturas da vaga (toJSON com skills)
 * @param {object[]} resumeMap        - map userId → resume instance
 * @param {number} [limit=3]          - máximo de similares a retornar
 * @returns {Array<{candidate, fitScore, commonSkills}>}
 */
function findSimilarCandidates(targetApplication, job, allApplications, resumeMap, limit = 3) {
    if (!targetApplication || !job || !allApplications.length) return [];

    const targetResume  = resumeMap[targetApplication.userId];
    const { skills: targetSkills } = parseResume(targetResume);
    const targetSkillSet = new Set(targetSkills.map(s => s.toLowerCase().trim()));

    const others = allApplications.filter(a =>
        a.userId !== targetApplication.userId &&
        a.status !== 'contratado' &&
        a.status !== 'rejeitado' &&
        a.status !== 'expirado'
    );

    const scored = others.map(app => {
        const resume = resumeMap[app.userId];
        const { skills } = parseResume(resume);
        const skillSet = new Set(skills.map(s => s.toLowerCase().trim()));

        const common = [...targetSkillSet].filter(s => skillSet.has(s));
        const union  = new Set([...targetSkillSet, ...skillSet]);
        const similarity = union.size > 0 ? Math.round((common.length / union.size) * 100) : 0;

        return {
            applicationId: app.id,
            userId:        app.userId,
            candidate:     app.candidate || {},
            fitScore:      calcFitScore(resume, job),
            similarity,
            commonSkills:  common.slice(0, 5),
            skills:        skills.slice(0, 6)
        };
    });

    return scored
        .filter(s => s.similarity > 0 || s.fitScore > 30)
        .sort((a, b) => (b.similarity + b.fitScore) - (a.similarity + a.fitScore))
        .slice(0, limit);
}

module.exports = {
    calcFitScore,
    findTalentsForJob,
    notifyRevisitedOpportunities,
    reactivateContact,
    findSimilarCandidates
};

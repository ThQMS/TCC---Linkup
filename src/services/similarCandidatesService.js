/**
 * similarCandidatesService.js
 *
 * Encontra candidatos que NÃO se candidataram a uma vaga específica,
 * mas têm alto fit com os requisitos da vaga ou com o perfil dos
 * candidatos já inscritos.
 *
 * Retorna até 3 candidatos ordenados pelo combinedScore (fitScore × 0.6 + skillSimilarity × 0.4).
 */

const { Op }          = require('sequelize');
const { Job, User, Resume, Application, Notification } = require('../models');
const parseResume     = require('../helpers/parseResume');
const transporter     = require('../helpers/mailer');
const sendSocket      = require('../helpers/socket');
const logger          = require('../helpers/logger');
const { calcFitScore } = require('./talentRediscoveryService');
const { isAvailable } = require('./availabilityService');

const COMBINED_THRESHOLD = 40;  // score mínimo combinado (0-100)
const MAX_RESULTS        = 3;
const MAX_SCAN           = 300; // candidatos a escanear no banco

// ─── Buscar candidatos sugeridos ───────────────────────────────────────────────

/**
 * @param {number} jobId         - ID da vaga
 * @param {number} companyUserId - ID da empresa (dono da vaga)
 * @returns {Promise<Array<{candidate, fitScore, skillSimilarity, combinedScore, commonSkills}>>}
 */
async function findSuggestedCandidates(jobId, companyUserId) {
    try {
        const job = await Job.findByPk(jobId);
        if (!job || job.UserId !== companyUserId) return [];

        // 1. IDs que já se candidataram a esta vaga
        const existingApps = await Application.findAll({
            where:      { jobId },
            attributes: ['userId']
        });
        const appliedIds = new Set(existingApps.map(a => a.userId));
        appliedIds.add(companyUserId);

        // 2. Candidatos que NÃO se candidataram (limite de varredura)
        const appliedIdsArr = [...appliedIds];
        const candidates = await User.findAll({
            where: {
                userType: 'candidato',
                id:       { [Op.notIn]: appliedIdsArr.length ? appliedIdsArr : [0] }
            },
            attributes: ['id', 'name', 'email', 'city', 'avatar', 'availabilityStatus'],
            limit:       MAX_SCAN
        });

        if (candidates.length === 0) return [];

        // 3. Currículos em batch
        const candidateIds = candidates.map(u => u.id);
        const resumes      = await Resume.findAll({ where: { userId: { [Op.in]: candidateIds } } });
        const resumeMap    = Object.fromEntries(resumes.map(r => [r.userId, r]));

        // 4. Habilidades agregadas dos candidatos já inscritos — perfil médio da vaga
        const applicantOnlyIds = [...appliedIds].filter(id => id !== companyUserId);
        const applicantResumes = applicantOnlyIds.length > 0
            ? await Resume.findAll({ where: { userId: { [Op.in]: applicantOnlyIds } } })
            : [];
        const aggregateSkills = new Set();
        for (const r of applicantResumes) {
            const { skills } = parseResume(r);
            skills.forEach(s => aggregateSkills.add(s.toLowerCase().trim()));
        }

        const jobJson = job.toJSON();
        const results = [];

        // 5. Pontuar cada candidato
        for (const user of candidates) {
            if (!isAvailable(user)) continue;

            const resume = resumeMap[user.id];
            if (!resume) continue;

            const { skills } = parseResume(resume);
            const candidateSkillSet = new Set(skills.map(s => s.toLowerCase().trim()));

            const fitScore = calcFitScore(resume, jobJson);

            let skillSimilarity = 0;
            if (aggregateSkills.size > 0 && candidateSkillSet.size > 0) {
                const common = [...candidateSkillSet].filter(s => aggregateSkills.has(s));
                const union  = new Set([...candidateSkillSet, ...aggregateSkills]);
                skillSimilarity = Math.round((common.length / union.size) * 100);
            }

            const combinedScore = Math.round(fitScore * 0.6 + skillSimilarity * 0.4);
            if (combinedScore < COMBINED_THRESHOLD) continue;

            const commonSkills = skills
                .filter(s => aggregateSkills.has(s.toLowerCase().trim()))
                .slice(0, 5);

            results.push({
                candidate: {
                    id:     user.id,
                    name:   user.name,
                    email:  user.email,
                    city:   user.city   || null,
                    avatar: user.avatar || null
                },
                fitScore,
                skillSimilarity,
                combinedScore,
                commonSkills
            });
        }

        return results
            .sort((a, b) => b.combinedScore - a.combinedScore)
            .slice(0, MAX_RESULTS);
    } catch (err) {
        logger.error('similarCandidatesService', 'Erro em findSuggestedCandidates', { jobId, err: err.message });
        return [];
    }
}

// ─── Contatar candidato sugerido ───────────────────────────────────────────────

/**
 * Envia notificação in-app + email ao candidato sugerido.
 * Grava uma Notification com type='similar_invite' para rastreio no dashboard.
 *
 * @param {number} jobId         - ID da vaga
 * @param {number} candidateId   - ID do candidato a ser contatado
 * @param {number} companyUserId - ID da empresa (validação de ownership)
 * @param {object} expressApp
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function contactSuggestedCandidate(jobId, candidateId, companyUserId, expressApp) {
    try {
        const [job, candidate] = await Promise.all([
            Job.findByPk(jobId,       { attributes: ['id', 'title', 'company', 'UserId'] }),
            User.findByPk(candidateId, { attributes: ['id', 'name', 'email'] })
        ]);

        if (!job)       return { ok: false, error: 'Vaga não encontrada.' };
        if (!candidate) return { ok: false, error: 'Candidato não encontrado.' };
        if (job.UserId !== companyUserId) return { ok: false, error: 'Sem permissão.' };

        // Evita convite duplicado
        const alreadySent = await Notification.findOne({
            where: {
                userId:  candidateId,
                type:    'similar_invite',
                link:    `/jobs/view/${job.id}`,
                message: { [Op.like]: `%${job.title}%` }
            }
        });
        if (alreadySent) return { ok: false, error: 'Candidato já foi convidado para esta vaga.' };

        const message = `${job.company} acredita que você é um ótimo perfil para a vaga "${job.title}". Quer conhecer e se candidatar?`;
        const link    = `/jobs/view/${job.id}`;

        // Notificação in-app (rastreável no dashboard pelo type 'similar_invite')
        await Notification.create({ userId: candidateId, type: 'similar_invite', message, link });

        // Socket.io (tempo real, se online)
        sendSocket(expressApp, candidateId, {
            title:   `${job.company} quer te conhecer!`,
            message: `Você tem perfil compatível com a vaga "${job.title}".`
        });

        // E-mail
        await transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      candidate.email,
            subject: `${job.company} convidou você para uma vaga — LinkUp`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:auto;">
                    <h2 style="color:#e63946;">LinkUp</h2>
                    <p>Olá, <strong>${candidate.name}</strong>!</p>
                    <p>
                        A empresa <strong>${job.company}</strong> identificou que o seu perfil é
                        compatível com a vaga <strong>"${job.title}"</strong> e gostaria de te convidar
                        para conhecer a oportunidade.
                    </p>
                    <a href="${process.env.BASE_URL}${link}"
                       style="display:inline-block;background:#e63946;color:white;padding:12px 24px;
                              border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
                        Ver vaga e se candidatar
                    </a>
                    <p style="color:#888;font-size:0.85rem;margin-top:24px;">
                        Você recebeu este convite porque seu perfil está ativo no LinkUp.
                        Caso não queira receber convites, atualize sua disponibilidade no perfil.
                    </p>
                </div>
            `
        }).catch(err => logger.warn('similarCandidatesService', 'Falha ao enviar email convite', { candidateId, err: err.message }));

        logger.info('similarCandidatesService', 'Candidato similar contatado', { jobId, candidateId, companyUserId });
        return { ok: true };
    } catch (err) {
        logger.error('similarCandidatesService', 'Erro em contactSuggestedCandidate', { jobId, candidateId, err: err.message });
        return { ok: false, error: err.message };
    }
}

module.exports = { findSuggestedCandidates, contactSuggestedCandidate };

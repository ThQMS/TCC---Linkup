
const { Application, User, Notification, Resume } = require('../models');
const logger              = require('../helpers/logger');
const { chatComplete }    = require('../helpers/aiService');
const { generatePdf }     = require('../helpers/pdfService');
const { escHtml }         = require('../helpers/pdfUtils');
const parseResume = require('../helpers/parseResume');
const transporter         = require('../helpers/mailer');
const sendSocketNotification = require('../helpers/socket');

/**
 * @returns {Promise<{emailError: Error|null}>}
 */
async function applyToJob({ job, user, resume, answers, coverLetter }) {
    // 1. Cria candidatura
    await Application.create({ jobId: job.id, userId: user.id, answers });

    // 2. Score de respostas abertas — fire-and-forget (não bloqueia o fluxo)
    _scoreOpenAnswers(job, answers, user.id);

    // 3. Notifica dono da vaga
    const jobOwner = await User.findByPk(job.UserId);
    if (jobOwner) {
        await Notification.create({
            userId:  jobOwner.id,
            message: user.name + ' se candidatou para a vaga "' + job.title + '"',
            type:    'info',
            link:    '/jobs/applications/' + job.id
        });
    }

    // 4. Gera PDF do currículo e envia e-mail para a empresa
    const { skills, education, experiences } = parseResume(resume);
    const phone     = resume?.phone     || user.phone     || '';
    const city      = resume?.city      || user.city      || '';
    const linkedin  = resume?.linkedin  || user.linkedin  || '';
    const github    = resume?.github    || user.github    || '';
    const birthDate = resume?.birthDate || user.birthDate || '';

    const resumeHTML = _buildResumeHtml({ user, resume, phone, city, linkedin, github, birthDate, skills, education, experiences });

    let pdfBuffer = null;
    try { pdfBuffer = await generatePdf(resumeHTML); } catch (e) {}

    return new Promise((resolve) => {
        transporter.sendMail({
            from:    process.env.GMAIL_USER,
            to:      job.email,
            subject: 'Nova candidatura: ' + user.name + ' — ' + job.title,
            html:    _buildApplicationEmail({ user, job, coverLetter }),
            attachments: pdfBuffer
                ? [{ filename: 'curriculo-' + user.name.replace(/\s+/g, '-').toLowerCase() + '.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
                : []
        }, (err) => resolve({ emailError: err || null }));
    });
}


/**
 * Atualiza o status da candidatura, envia notificação in-app + socket,
 * e dispara feedback de rejeição via IA (async) se status === 'rejeitado'.
 *
 * @param {object} opts
 * @param {object} opts.application - Instância Sequelize da candidatura
 * @param {object} opts.job         - Instância Sequelize da vaga
 * @param {string} opts.status      - Novo status
 * @param {object} opts.expressApp  - req.app (para Socket.io)
 */
async function updateApplicationStatus({ application, job, status, expressApp }) {
    await application.update({ status });

    const isApproved  = status === 'aprovado';
    const isRejected  = status === 'rejeitado';
    const isContrated = status === 'contratado';

    if (isApproved || isRejected || isContrated) {
        await Notification.create({
            userId:  application.userId,
            message: isContrated
                ? 'Parabéns! Você foi contratado(a) para a vaga "' + job.title + '" na ' + job.company + '! 🎉'
                : isApproved
                    ? 'Parabéns! Sua candidatura para "' + job.title + '" foi aprovada! 🎉'
                    : 'Sua candidatura para "' + job.title + '" não foi aprovada desta vez.',
            type: (isApproved || isContrated) ? 'success' : 'danger',
            link: '/jobs/view/' + job.id
        });
    }

    sendSocketNotification(expressApp, application.userId, {
        title:   'Status atualizado',
        message: 'Candidatura para ' + job.title + ': ' + status
    });

    if (isRejected) {
        _sendRejectionFeedback(job, application.userId);
    }
    if (isContrated) {
        _sendCongratsEmail(job, application.userId);
    }
}

/**
 * Move um candidato para uma nova etapa do processo seletivo.
 * Registra histórico com timestamp.
 */
async function updateApplicationStage({ application, stageName, expressApp }) {
    const history = JSON.parse(application.stageHistory || '[]');
    history.push({ stage: stageName, movedAt: new Date().toISOString() });
    await Application.update(
        { currentStage: stageName, stageHistory: JSON.stringify(history) },
        { where: { id: application.id } }
    );

    const job = await (require('../models').Job).findByPk(application.jobId);
    if (job) {
        await Notification.create({
            userId:  application.userId,
            message: 'Você avançou para a etapa "' + stageName + '" no processo seletivo de ' + job.company + '.',
            type:    'info',
            link:    '/jobs/view/' + job.id
        });
        if (expressApp) {
            sendSocketNotification(expressApp, application.userId, {
                title:   'Nova etapa!',
                message: 'Você avançou para "' + stageName + '" em ' + job.title
            });
        }
    }
}

/**
 * Ao encerrar uma vaga, envia feedback construtivo via IA para todos os
 * candidatos que não foram contratados. Atualiza status para 'expirado'.
 */
async function sendBulkClosingFeedback(job) {
    try {
        const { Op } = require('sequelize');
        const pending = await Application.findAll({
            where: { jobId: job.id, status: { [Op.notIn]: ['contratado', 'expirado'] } }
        });
        for (const app of pending) {
            await app.update({ status: 'expirado' });
            _sendRejectionFeedback(job, app.userId);
            await new Promise(r => setTimeout(r, 600));
        }
        logger.info('applicationService', 'Feedback de encerramento enviado', { jobId: job.id, count: pending.length });
    } catch (e) {
        logger.error('applicationService', 'Erro no bulk feedback', { err: e.message });
    }
}

async function _scoreOpenAnswers(job, answersJson, userId) {
    try {
        const questions  = JSON.parse(job.questions || '[]');
        const answersArr = JSON.parse(answersJson);
        const openAnswers = questions
            .map((q, i) => ({ q, a: answersArr[i] }))
            .filter(({ q, a }) => (q.type === 'aberta' || q.type === 'situacional') && a);

        if (openAnswers.length === 0) return;

        const qaText = openAnswers.map(({ q, a }) => 'Pergunta (' + q.type + '): ' + q.question + '\nResposta: ' + a).join('\n\n');
        const raw    = (await chatComplete(
            [{ role: 'user', content: 'Avalie as respostas do candidato para a vaga de ' + job.title + '.\n\nCRITÉRIOS:\n1. Relevância\n2. Profundidade\n3. Autenticidade\n4. Coerência\n5. Especificidade\n\n' + qaText + '\n\nRetorne APENAS JSON: { "score": 0-100, "feedback": "2 linhas", "autenticidade": 0-10, "profundidade": 0-10 }' }],
            { max_tokens: 300, temperature: 0.2 }
        )).replace(/```json|```/g, '');

        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return;
        const parsed = JSON.parse(match[0]);
        const app    = await Application.findOne({ where: { jobId: job.id, userId }, order: [['createdAt', 'DESC']] });
        if (app) await app.update({ answersScore: parsed.score, answersFeedback: parsed.feedback });
    } catch (e) {
        logger.debug('applicationService', 'Erro ao pontuar respostas abertas', { err: e.message });
    }
}

async function _sendRejectionFeedback(job, candidateId) {
    try {
        const candidate = await User.findByPk(candidateId);
        if (!candidate) return;
        const resume = await Resume.findOne({ where: { userId: candidateId } });
        const { skills, experiences: exps } = parseResume(resume);

        const feedback = await chatComplete(
            [{ role: 'user', content: 'Gere um feedback de rejeição construtivo e respeitoso.\n\nVAGA: ' + job.title + ' na ' + job.company + '\nREQUISITOS: ' + (job.requirements || 'Não informados') + '\n\nCANDIDATO:\nHabilidades: ' + (skills.join(', ') || 'Não informadas') + '\nExperiências: ' + (exps.map(e => e.role).join(', ') || 'Não informadas') + '\n\nINSTRUÇÕES:\n- Tom respeitoso\n- Máximo 3 parágrafos\n- Sem falsas esperanças\n- Sugira como melhorar\n- Português brasileiro\n- Comece com "Olá, ' + candidate.name + ',"' }],
            { max_tokens: 400, temperature: 0.7 }
        );
        if (!feedback) return;

        await transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      candidate.email,
            subject: `Atualização sobre sua candidatura — ${job.title}`,
            html:    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;"><h2 style="color:#f03e3e;margin:0;">Link<span style="color:white;">Up</span></h2></div><div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none;"><p style="white-space:pre-wrap;">${feedback}</p><p style="color:#888;font-size:0.85rem;margin-top:16px;">Continue explorando novas oportunidades no LinkUp.</p><a href="${process.env.BASE_URL || 'http://localhost:3000'}" style="display:inline-block;background:#f03e3e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px;">Ver Vagas</a></div></div>`
        });
        logger.info('applicationService', 'E-mail de auto-feedback enviado', { candidateId: candidate.id });
    } catch (e) {
        logger.error('applicationService', 'Erro no auto-feedback', { err: e.message });
    }
}

function _buildResumeHtml({ user: u, resume, phone, city, linkedin, github, birthDate, skills, education, experiences }) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;color:#111;padding:30px;max-width:700px;margin:auto}h1{font-size:1.6rem;margin-bottom:4px}.subtitle{color:#555;font-size:.9rem;margin-bottom:20px}h2{font-size:1rem;font-weight:700;color:#e53935;border-bottom:2px solid #e53935;padding-bottom:4px;margin-top:24px}.item{border-left:3px solid #e53935;padding-left:12px;margin-bottom:16px}.item-title{font-weight:700;margin:0}.item-sub{color:#e53935;font-size:.9rem;margin:2px 0}.item-period{color:#888;font-size:.8rem}.item-desc{color:#444;font-size:.9rem;margin-top:4px}.skill{display:inline-block;background:#f5f5f5;border:1px solid #e53935;color:#e53935;border-radius:20px;padding:3px 10px;font-size:.8rem;margin:3px}.summary{color:#444;line-height:1.7}</style></head><body>'
        + '<h1>' + escHtml(u.name) + '</h1>'
        + '<p class="subtitle">📧 ' + escHtml(u.email)
        + (phone     ? ' | 📱 ' + escHtml(phone)    : '')
        + (city      ? ' | 📍 ' + escHtml(city)     : '')
        + (birthDate ? ' | 🎂 ' + escHtml(birthDate) : '')
        + (linkedin  ? ' | <a href="' + escHtml(linkedin) + '">LinkedIn</a>' : '')
        + (github    ? ' | <a href="' + escHtml(github)   + '">GitHub</a>'   : '')
        + '</p>'
        + (resume?.summary ? '<h2>Resumo</h2><p class="summary">' + escHtml(resume.summary) + '</p>' : '')
        + (experiences.length ? '<h2>Experiências</h2>' + experiences.map(e =>
            '<div class="item"><p class="item-title">' + escHtml(e.role) + '</p>'
            + '<p class="item-sub">'  + escHtml(e.company) + '</p>'
            + (e.period      ? '<p class="item-period">📅 ' + escHtml(e.period) + '</p>'      : '')
            + (e.description ? '<p class="item-desc">'      + escHtml(e.description) + '</p>' : '')
            + '</div>').join('') : '')
        + (education.length ? '<h2>Formação</h2>' + education.map(e =>
            '<div class="item"><p class="item-title">' + escHtml(e.course) + '</p>'
            + '<p class="item-sub">' + escHtml(e.institution) + '</p>'
            + (e.period ? '<p class="item-period">📅 ' + escHtml(e.period) + '</p>' : '')
            + '</div>').join('') : '')
        + (skills.length ? '<h2>Habilidades</h2><div>' + skills.map(s => '<span class="skill">' + escHtml(s) + '</span>').join('') + '</div>' : '')
        + '</body></html>';
}

function _buildApplicationEmail({ user: u, job, coverLetter }) {
    return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">'
        + '<div style="background:#f03e3e;padding:24px 32px;border-radius:8px 8px 0 0">'
        + '<h2 style="color:white;margin:0">Nova Candidatura</h2>'
        + '<p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:.9rem">Vaga: <strong>' + escHtml(job.title) + '</strong></p>'
        + '</div>'
        + '<div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none">'
        + '<p><strong>' + escHtml(u.name) + '</strong> se candidatou à vaga de <strong>' + escHtml(job.title) + '</strong>.</p>'
        + (coverLetter ? '<div style="background:white;border-left:4px solid #f03e3e;padding:16px 20px;margin-bottom:20px"><p style="font-size:.8rem;color:#888;margin:0 0 8px">Carta de Apresentação</p><p style="white-space:pre-wrap">' + escHtml(coverLetter) + '</p></div>' : '')
        + '<p style="color:#666;font-size:.9rem">Currículo em anexo.</p>'
        + '</div></div>';
}

async function _sendCongratsEmail(job, candidateId) {
    try {
        const candidate = await User.findByPk(candidateId);
        if (!candidate) return;
        const BASE = process.env.BASE_URL || 'http://localhost:3000';
        await transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      candidate.email,
            subject: `Parabéns pela contratação — ${job.title}`,
            html:    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                        <div style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;">
                          <h2 style="color:#f03e3e;margin:0;">Link<span style="color:white;">Up</span></h2>
                        </div>
                        <div style="background:#f9f9f9;padding:32px;border:1px solid #eee;border-top:none;">
                          <h2 style="color:#1a1a1a;margin:0 0 16px;">🎉 Parabéns, ${escHtml(candidate.name)}!</h2>
                          <p style="color:#444;line-height:1.7;">Que notícia incrível! Você foi selecionado(a) para a vaga de <strong>${escHtml(job.title)}</strong> na <strong>${escHtml(job.company)}</strong>. Todo o esforço e dedicação valeram a pena.</p>
                          <p style="color:#444;line-height:1.7;">Em breve a empresa entrará em contato com os próximos passos. Fique de olho no seu e-mail.</p>
                          <p style="color:#888;font-size:0.9rem;margin-top:20px;line-height:1.6;">Dica: agora que você encontrou sua oportunidade, considere atualizar seu status para <em>"Não disponível"</em> no seu perfil. Isso evita receber contatos desnecessários enquanto você começa esse novo ciclo.</p>
                          <a href="${BASE}/profile" style="display:inline-block;background:#4caf50;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;">Atualizar meu status</a>
                          <p style="color:#aaa;font-size:0.8rem;margin-top:24px;">Desejamos muito sucesso nessa nova jornada! 🚀</p>
                        </div>
                      </div>`
        });
        logger.info('applicationService', 'E-mail de parabéns enviado', { candidateId });
    } catch (e) {
        logger.error('applicationService', 'Erro ao enviar e-mail de parabéns', { err: e.message });
    }
}

module.exports = { applyToJob, updateApplicationStatus, updateApplicationStage, sendBulkClosingFeedback };

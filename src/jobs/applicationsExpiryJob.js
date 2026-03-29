const logger = require("../helpers/logger");
const cron = require('node-cron');
const { Application, Job, User, Notification } = require('../models');
const parseResume = require('../helpers/parseResume');
const { Op }      = require('sequelize');
const { chatComplete } = require('../helpers/aiService');
const transporter = require('../helpers/mailer');


async function gerarFeedbackExpiracao(candidateName, jobTitle, jobCompany, skills, exps) {
    try {
        return await chatComplete(
            [{ role: 'user', content: `Você é um mentor de carreira empático. O candidato ${candidateName} se candidatou à vaga de ${jobTitle} na empresa ${jobCompany}, mas a empresa não deu nenhum retorno e o processo foi encerrado automaticamente por inatividade.\n\nPerfil do candidato:\nHabilidades: ${skills.join(', ') || 'não informadas'}\nExperiências: ${exps.map(e => e.role).join(', ') || 'não informadas'}\n\nEscreva uma mensagem em até 3 parágrafos que:\n1. Explique com clareza que a empresa não respondeu a tempo — isso não é culpa do candidato\n2. Destaque 2 pontos positivos REAIS do perfil dele com base nas habilidades e experiências\n3. Encoraje a continuar se candidatando com confiança\n\nTom: humano, acolhedor, direto. Sem clichês. Em português brasileiro. Comece com "Olá, ${candidateName},"` }],
            { max_tokens: 400, temperature: 0.7 }
        );
    } catch (e) {
        return null;
    }
}

async function enviarEmailCandidatoExpiracao(candidate, job, feedbackText) {
    await transporter.sendMail({
        from: `"LinkUp" <${process.env.GMAIL_USER}>`,
        to: candidate.email,
        subject: `Processo encerrado: ${job.title}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;">
                    <h2 style="color:#f03e3e;margin:0;">Link<span style="color:white;">Up</span></h2>
                </div>
                <div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none;">
                    <p style="white-space:pre-wrap;line-height:1.7;">${feedbackText}</p>
                    <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;margin-top:16px;border-radius:4px;">
                        <p style="color:#92400e;font-size:0.85rem;margin:0;">💡 Use "Ver minha compatibilidade" antes de se candidatar para maximizar suas chances nas próximas vagas.</p>
                    </div>
                    <a href="${process.env.BASE_URL || 'http://localhost:3000'}"
                        style="display:inline-block;background:#f03e3e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;">
                        Ver Novas Vagas
                    </a>
                </div>
            </div>`
    });
}


cron.schedule('0 3 * * *', async () => {
    logger.info('applicationsExpiryJob', 'Verificando vagas fantasmas e candidaturas pendentes...');

    const now      = new Date();
    const day7ago  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const day8ago  = new Date(now - 8  * 24 * 60 * 60 * 1000);
    const day21ago = new Date(now - 21 * 24 * 60 * 60 * 1000);
    const day25ago = new Date(now - 25 * 24 * 60 * 60 * 1000);
    const day26ago = new Date(now - 26 * 24 * 60 * 60 * 1000);
    const day30ago = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const { Resume } = require('../models');


    try {

        //  LEMBRETE DIA 7 — candidatura sem resposta
       
        const pending7 = await Application.findAll({
            where: {
                status: 'pendente',
                createdAt: { [Op.lte]: day7ago, [Op.gte]: day8ago },
                reminderSent: { [Op.or]: [false, null] }
            }
        });

        for (const app of pending7) {
            try {
                const job       = await Job.findByPk(app.jobId);
                const candidate = await User.findByPk(app.userId);
                const recruiter = job ? await User.findByPk(job.UserId) : null;
                if (!job || !recruiter) continue;

                await transporter.sendMail({
                    from: `"LinkUp" <${process.env.GMAIL_USER}>`,
                    to: recruiter.email,
                    subject: `⏰ ${candidate?.name} aguarda retorno há 7 dias — ${job.title}`,
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                            <div style="background:#f03e3e;padding:24px 32px;border-radius:8px 8px 0 0;">
                                <h2 style="color:white;margin:0;">Candidato aguardando retorno</h2>
                            </div>
                            <div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none;">
                                <p>Olá, <strong>${recruiter.name}</strong>!</p>
                                <p><strong>${candidate?.name || 'Um candidato'}</strong> está aguardando retorno sobre a vaga <strong>${job.title}</strong> há 7 dias.</p>
                                <p>Dar um retorno faz uma enorme diferença — mesmo que seja uma recusa, o candidato merece saber.</p>
                                <a href="${process.env.BASE_URL || 'http://localhost:3000'}/jobs/applications/${job.id}"
                                    style="display:inline-block;background:#f03e3e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px;">
                                    Ver Candidatos
                                </a>
                            </div>
                        </div>`
                });

                await app.update({ reminderSent: true });
                logger.info('applicationsExpiryJob', `Lembrete candidatura → ${recruiter.email}`);
            } catch (e) {
                logger.error('applicationsExpiryJob', 'Erro lembrete candidatura', { err: e.message });
            }
        }

 
        //  EXPIRAÇÃO DIA 21 — candidatura sem resposta
      
        const pending21 = await Application.findAll({
            where: { status: 'pendente', createdAt: { [Op.lte]: day21ago } }
        });

        for (const app of pending21) {
            try {
                const job       = await Job.findByPk(app.jobId);
                const candidate = await User.findByPk(app.userId);
                if (!job || !candidate) continue;

                const cv             = await Resume.findOne({ where: { userId: candidate.id } });
                const { skills, experiences: exps } = parseResume(cv);

                const feedback = await gerarFeedbackExpiracao(candidate.name, job.title, job.company, skills, exps)
                    || `Olá, ${candidate.name}! A empresa não respondeu à sua candidatura para ${job.title} dentro do prazo. Isso não é reflexo da sua capacidade — continue se candidatando!`;

                await enviarEmailCandidatoExpiracao(candidate, job, feedback);

                await app.update({ status: 'expirado' });
                await Notification.create({
                    userId:  candidate.id,
                    message: `Sua candidatura para "${job.title}" foi encerrada após 21 dias sem retorno.`,
                    type:    'warning',
                    link:    '/jobs/my-applications'
                });

                logger.info('applicationsExpiryJob', `Candidatura expirada → ${candidate.email} (${job.title})`);
            } catch (e) {
                logger.error('applicationsExpiryJob', 'Erro expiração candidatura', { err: e.message });
            }
        }

        
        // 3. AVISO DIA 25 — vaga fantasma (5 dias antes de expirar)
       
        const vagasAvisoExpiracao = await Job.findAll({
            where: {
                status: 'aberta',
                updatedAt: { [Op.lte]: day25ago, [Op.gte]: day26ago }
            }
        });

        for (const job of vagasAvisoExpiracao) {
            try {
                const recruiter = await User.findByPk(job.UserId);
                if (!recruiter) continue;

                const pendentes = await Application.count({ where: { jobId: job.id, status: 'pendente' } });

                await transporter.sendMail({
                    from: `"LinkUp" <${process.env.GMAIL_USER}>`,
                    to: recruiter.email,
                    subject: `⚠️ Sua vaga "${job.title}" será inativada em 5 dias`,
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                            <div style="background:#f59e0b;padding:24px 32px;border-radius:8px 8px 0 0;">
                                <h2 style="color:white;margin:0;">⚠️ Vaga prestes a expirar</h2>
                            </div>
                            <div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none;">
                                <p>Olá, <strong>${recruiter.name}</strong>!</p>
                                <p>A vaga <strong>${job.title}</strong> está aberta há mais de 25 dias sem nenhuma atividade da sua parte.</p>
                                ${pendentes > 0 ? `<p style="color:#d97706;font-weight:600;">⏳ ${pendentes} candidato(s) ainda aguardam retorno.</p>` : ''}
                                <p><strong>Em 5 dias ela será inativada automaticamente</strong> para evitar candidatos esperando por vagas fantasmas.</p>
                                <p>Para manter a vaga ativa, basta acessar o sistema e dar retorno aos candidatos ou atualizar a vaga.</p>
                                <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;">
                                    <a href="${process.env.BASE_URL || 'http://localhost:3000'}/jobs/applications/${job.id}"
                                        style="display:inline-block;background:#f03e3e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
                                        Ver Candidatos
                                    </a>
                                    <a href="${process.env.BASE_URL || 'http://localhost:3000'}/jobs/edit/${job.id}"
                                        style="display:inline-block;background:transparent;border:2px solid #f03e3e;color:#f03e3e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
                                        Editar Vaga
                                    </a>
                                </div>
                            </div>
                        </div>`
                });

                logger.info('applicationsExpiryJob', `Aviso 5 dias → ${recruiter.email} (${job.title})`);
            } catch (e) {
                logger.error('applicationsExpiryJob', 'Erro aviso vaga', { err: e.message });
            }
        }

      
        //EXPIRAÇÃO DIA 30 — vaga fantasma
     
        const vagasExpiradas = await Job.findAll({
            where: {
                status: 'aberta',
                updatedAt: { [Op.lte]: day30ago }
            }
        });

        for (const job of vagasExpiradas) {
            try {
                const recruiter = await User.findByPk(job.UserId);

                // Busca todos os candidatos pendentes desta vaga
                const candidaturasPendentes = await Application.findAll({
                    where: { jobId: job.id, status: 'pendente' }
                });

                // Dispara feedback para cada candidato pendente
                for (const app of candidaturasPendentes) {
                    try {
                        const candidate = await User.findByPk(app.userId);
                        if (!candidate) continue;

                        const cv             = await Resume.findOne({ where: { userId: candidate.id } });
                        const { skills, experiences: exps } = parseResume(cv);

                        const feedback = await gerarFeedbackExpiracao(candidate.name, job.title, job.company, skills, exps)
                            || `Olá, ${candidate.name}! Infelizmente a vaga de ${job.title} foi encerrada por inatividade da empresa. Não é reflexo da sua candidatura — continue em frente!`;

                        await enviarEmailCandidatoExpiracao(candidate, job, feedback);

                        await app.update({ status: 'expirado' });
                        await Notification.create({
                            userId:  candidate.id,
                            message: `A vaga "${job.title}" foi encerrada por inatividade da empresa.`,
                            type:    'warning',
                            link:    '/jobs/my-applications'
                        });

                        logger.info('applicationsExpiryJob', `Feedback expiração vaga → ${candidate.email}`);
                    } catch (e) {
                        logger.error('applicationsExpiryJob', 'Erro feedback candidato', { err: e.message });
                    }
                }

                // Expira a vaga
                await job.update({ status: 'expirada' });

                // Notifica a empresa
                await Notification.create({
                    userId:  job.UserId,
                    message: `Sua vaga "${job.title}" foi inativada automaticamente por 30 dias sem atividade.`,
                    type:    'danger',
                    link:    `/jobs/edit/${job.id}`
                });

                if (recruiter) {
                    await transporter.sendMail({
                        from: `"LinkUp" <${process.env.GMAIL_USER}>`,
                        to: recruiter.email,
                        subject: `Vaga inativada: ${job.title}`,
                        html: `
                            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                                <div style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;">
                                    <h2 style="color:#f03e3e;margin:0;">Vaga inativada automaticamente</h2>
                                </div>
                                <div style="background:#f9f9f9;padding:24px 32px;border:1px solid #eee;border-top:none;">
                                    <p>Olá, <strong>${recruiter.name}</strong>!</p>
                                    <p>A vaga <strong>${job.title}</strong> foi inativada após 30 dias sem atividade da sua parte.</p>
                                    <p>Todos os candidatos pendentes foram notificados automaticamente.</p>
                                    <p style="color:#666;">Para reabrir a vaga, acesse o sistema, atualize a descrição e mude o status para "Aberta".</p>
                                    <a href="${process.env.BASE_URL || 'http://localhost:3000'}/jobs/edit/${job.id}"
                                        style="display:inline-block;background:#f03e3e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px;">
                                        Reabrir Vaga
                                    </a>
                                </div>
                            </div>`
                    });
                }

                logger.info('applicationsExpiryJob', `Vaga expirada → ${job.title} (${candidaturasPendentes.length} candidatos notificados)`);
            } catch (e) {
                logger.error('applicationsExpiryJob', 'Erro expiração vaga', { err: e.message });
            }
        }

        logger.info('applicationsExpiryJob', `Resumo — ${pending7.length} lembretes, ${pending21.length} candidaturas expiradas, ${vagasAvisoExpiracao.length} avisos de vaga, ${vagasExpiradas.length} vagas expiradas`);

    } catch (e) {
        logger.error('applicationsExpiryJob', 'Erro geral', { err: e.message });
    }
});

logger.info('applicationsExpiryJob', 'Job de vagas fantasmas agendado (diário 3h).');
module.exports = {};
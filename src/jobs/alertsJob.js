const cron        = require('node-cron');
const { User, Job, Resume, Application } = require('../models');
const { Op }      = require('sequelize');
const parseResume = require('../helpers/parseResume');
const transporter = require('../helpers/mailer');
const logger      = require('../helpers/logger');

// Calcula score de compatibilidade entre keywords do candidato e texto da vaga
function calcScore(keywords, job) {
    const jobText = [job.title, job.description, job.requirements].join(' ').toLowerCase();
    return keywords.filter(kw => jobText.includes(kw)).length;
}

cron.schedule('0 8 * * 1', async () => {
    logger.info('alertsJob', 'Iniciando job de alertas semanais...');
    try {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Busca vagas abertas da última semana
        const newJobs = await Job.findAll({
            where: { status: 'aberta', createdAt: { [Op.gte]: oneWeekAgo } },
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        if (newJobs.length === 0) {
            logger.info('alertsJob', 'Nenhuma vaga nova na semana.');
            return;
        }

        // Busca candidatos verificados com currículo
        const candidates = await User.findAll({
            where: { userType: 'candidato', isVerified: true }
        });

        for (const candidate of candidates) {
            try {
                const resume = await Resume.findOne({ where: { userId: candidate.id } });
                if (!resume) continue;

                const { skills, experiences } = parseResume(resume);
                const keywords    = [...skills, ...experiences.map(e => e.role || '')]
                    .map(s => s.toLowerCase().trim())
                    .filter(s => s.length > 3);

                if (keywords.length === 0) continue;


                const applied = await Application.findAll({
                    where: { userId: candidate.id },
                    attributes: ['jobId']
                });
                const appliedIds = applied.map(a => a.jobId);

                const scored = newJobs
                    .filter(j => !appliedIds.includes(j.id))
                    .map(job => ({ job, score: calcScore(keywords, job) }))
                    .filter(s => s.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5);

                if (scored.length === 0) continue;

                const jobsHtml = scored.map(({ job }) => `
                    <div style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:12px;">
                        <h3 style="color:#e63946;margin:0 0 4px;">${job.title}</h3>
                        <p style="color:#666;margin:0 0 8px;">${job.company} · ${job.modality || ''} ${job.city ? '· ' + job.city : ''}</p>
                        ${job.salary ? `<p style="color:#333;margin:0 0 8px;">💰 R$ ${job.salary}</p>` : ''}
                        <a href="${process.env.BASE_URL}/jobs/view/${job.id}"
                            style="background:#e63946;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;">
                            Ver Vaga
                        </a>
                    </div>
                `).join('');

                await transporter.sendMail({
                    from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
                    to:      candidate.email,
                    subject: `🔔 ${scored.length} novas vagas para você esta semana — LinkUp`,
                    html: `
                        <div style="font-family:sans-serif;max-width:600px;margin:auto;">
                            <h2 style="color:#e63946;">LinkUp</h2>
                            <p>Olá, <strong>${candidate.name}</strong>!</p>
                            <p>Separamos as melhores vagas da semana baseadas no seu perfil:</p>
                            ${jobsHtml}
                            <p style="color:#888;font-size:0.85rem;margin-top:24px;">
                                Para não receber mais esses emails, acesse seu perfil e desative os alertas.
                            </p>
                        </div>
                    `
                });

                logger.info('alertsJob', `Email enviado para ${candidate.email}`, { vagas: scored.length });
                await new Promise(r => setTimeout(r, 500)); // evita rate limit do Gmail
            } catch (e) {
                logger.error('alertsJob', `Erro ao processar candidato ${candidate.email}`, { err: e.message });
            }
        }
        logger.info('alertsJob', 'Job concluído.');
    } catch (err) {
        logger.error('alertsJob', 'Erro geral', { err: err.message });
    }
}, { timezone: 'America/Sao_Paulo' });

module.exports = {};

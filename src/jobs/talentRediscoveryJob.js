const cron   = require('node-cron');
const { Op } = require('sequelize');
const { Job, User, Resume, Application } = require('../models');
const { notifyRevisitedOpportunities }   = require('../services/talentRediscoveryService');
const { checkAndUpdateAvailability }     = require('../services/availabilityService');
const logger = require('../helpers/logger');


cron.schedule('0 2 * * *', async () => {
    logger.info('talentRediscoveryJob', 'Iniciando job noturno de redescoberta...');
    try {
        await _processRevisitedOpportunities();
        await _updateCandidateAvailability();
        logger.info('talentRediscoveryJob', 'Job concluído.');
    } catch (err) {
        logger.error('talentRediscoveryJob', 'Erro geral no job', { err: err.message });
    }
}, { timezone: 'America/Sao_Paulo' });


async function _processRevisitedOpportunities() {
    const oneDayAgo   = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentJobs  = await Job.findAll({
        where: { status: 'aberta', updatedAt: { [Op.gte]: oneDayAgo } },
        limit: 30,
        order: [['updatedAt', 'DESC']]
    });

    if (recentJobs.length === 0) {
        logger.info('talentRediscoveryJob', 'Nenhuma vaga recente para processar.');
        return;
    }

    logger.info('talentRediscoveryJob', `Processando ${recentJobs.length} vagas recentes...`);

    // Passa null como expressApp — candidatos offline receberão só o email,
    // o Socket.io só funciona em tempo real
    for (const job of recentJobs) {
        await notifyRevisitedOpportunities(job, null);
        // Throttle leve para não sobrecarregar DB e Gmail
        await _sleep(300);
    }
}


async function _updateCandidateAvailability() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const activeApplications = await Application.findAll({
        where:      { createdAt: { [Op.gte]: thirtyDaysAgo } },
        attributes: ['userId'],
        group:      ['userId']
    });
    const activeIds = [...new Set(activeApplications.map(a => a.userId))];

    logger.info('talentRediscoveryJob', `Verificando disponibilidade de ${activeIds.length} candidatos...`);

    let updated = 0;
    for (const userId of activeIds) {
        const { changed } = await checkAndUpdateAvailability(userId, null);
        if (changed) updated++;
        await _sleep(50);
    }

    logger.info('talentRediscoveryJob', `Disponibilidade atualizada: ${updated} candidatos alterados.`);
}

function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = {};

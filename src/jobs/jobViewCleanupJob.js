const cron     = require('node-cron');
const { Op }   = require('sequelize');
const { JobView } = require('../models');
const logger = require('../helpers/logger');

// Executa todo domingo às 4h — remove registros de JobView com mais de 90 dias
cron.schedule('0 4 * * 0', async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
        const deleted = await JobView.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
        logger.info('jobViewCleanupJob', `${deleted} registros removidos (>90 dias)`);
    } catch (e) {
        logger.error('jobViewCleanupJob', 'Erro no cleanup de JobView', { err: e.message });
    }
});

logger.info('jobViewCleanupJob', 'JobView cleanup agendado (domingo 4h)');
module.exports = {};

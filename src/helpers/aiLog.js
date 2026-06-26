const AiLog  = require('../models/AiLog');
const logger = require('./logger');

async function logAi(userId, feature, startTime, success) {
    await AiLog.create({
        userId:     userId || null,
        feature,
        durationMs: Date.now() - startTime,
        success
    }).catch((err) => {
        // Não falha a request por erro de log, mas registra para não perder métricas em silêncio.
        logger.warn('aiLog', 'Falha ao gravar log de IA', { feature, err: err.message });
    });
}

module.exports = logAi;

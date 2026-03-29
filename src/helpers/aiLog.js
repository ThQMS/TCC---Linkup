const AiLog = require('../models/AiLog');

async function logAi(userId, feature, startTime, success) {
    await AiLog.create({
        userId:     userId || null,
        feature,
        durationMs: Date.now() - startTime,
        success
    }).catch(() => {});
}

module.exports = logAi;

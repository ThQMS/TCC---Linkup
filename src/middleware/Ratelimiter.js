const rateLimit = require('express-rate-limit');
const { client } = require('../config/redis');
const logger = require('../helpers/logger');

// Teto GLOBAL de chamadas à IA por dia (protege a conta Groq de estourar o limite
// real e gerar 429 em cascata). Diferente do aiLimiter (por usuário), este é
// compartilhado entre todos. Sem Redis, degrada para "permitir" (não bloqueia em dev).
const GROQ_DAILY_LIMIT = parseInt(process.env.GROQ_DAILY_LIMIT, 10) || 1000;

async function aiGlobalLimiter(req, res, next) {
    try {
        const key = `ai:global:${new Date().toISOString().slice(0, 10)}`;
        const used = await client.incr(key);
        if (used === 1) await client.expire(key, 24 * 60 * 60);
        if (used > GROQ_DAILY_LIMIT) {
            logger.warn('aiGlobalLimiter', 'Limite diário global da IA atingido', { used, limit: GROQ_DAILY_LIMIT });
            return res.status(429).json({ error: 'O limite diário de uso da IA foi atingido. Tente novamente amanhã.' });
        }
    } catch {
        // Redis indisponível — não bloqueia (best-effort). aiLimiter por usuário continua valendo.
    }
    next();
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1h
    max: 5,
    message: { error: 'Muitos registros. Tente novamente em 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 10,
    // Usuários autenticados são identificados pelo ID — evita que um usuário
    // consuma a cota de outro compartilhando o mesmo IP (ex: NAT corporativo)
    keyGenerator: (req) => (req.user?.id ? `user_${req.user.id}` : req.ip),
    message: { error: 'Muitas requisições à IA. Aguarde um momento.' },
    standardHeaders: true,
    legacyHeaders: false
});

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5,
    message: { error: 'Muitas tentativas de verificação. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5,
    message: { error: 'Muitas tentativas de recuperação. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5,
    message: { error: 'Muitas mensagens enviadas. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 3,
    message: { error: 'Muitos uploads. Aguarde um minuto.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { loginLimiter, registerLimiter, aiLimiter, aiGlobalLimiter, verifyLimiter, resetLimiter, contactLimiter, uploadLimiter };
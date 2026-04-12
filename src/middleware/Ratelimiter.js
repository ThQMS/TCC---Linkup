const rateLimit = require('express-rate-limit');

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

module.exports = { loginLimiter, registerLimiter, aiLimiter, verifyLimiter, resetLimiter, contactLimiter, uploadLimiter };
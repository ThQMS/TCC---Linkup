const crypto  = require('crypto');
const passport = require('passport');
const { User, Job } = require('../models');
const { auditLog, AUDIT_ACTIONS, maskEmail } = require('../middleware/auditLog');
const { recordFailure, isLocked, clearFailures } = require('../helpers/loginLockout');
const escapeHtml = require('../helpers/escapeHtml');
const logger  = require('../helpers/logger');
const transporter = require('../helpers/mailer');

const CODE_EXPIRY_MINUTES = 15;
const RESET_EXPIRY_MINUTES = 30;

// Retorna a URL base da aplicação a partir da requisição (respeita proxy via trust proxy)
function baseUrl(req) {
    return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// Bloqueia open redirect: só aceita caminhos internos absolutos (/...),
// rejeitando URLs protocol-relative (//evil.com) e backslash (/\evil.com).
function safePath(redirect) {
    if (typeof redirect !== 'string') return '/';
    if (!redirect.startsWith('/')) return '/';
    if (redirect.startsWith('//') || redirect.startsWith('/\\')) return '/';
    return redirect;
}


exports.showLogin = async (req, res) => {
    const [totalJobs, totalCompanies] = await Promise.all([
        Job.count(),
        User.count({ where: { userType: 'empresa' } })
    ]).catch(() => [0, 0]);
    res.render('login', { showRegisterBtn: true, csrfToken: res.locals.csrfToken, totalJobs, totalCompanies });
};

exports.showRegister = async (req, res) => {
    const [totalJobs, totalCompanies] = await Promise.all([
        Job.count(),
        User.count({ where: { userType: 'empresa' } })
    ]).catch(() => [0, 0]);
    res.render('register', { showLoginBtn: true, csrfToken: res.locals.csrfToken, totalJobs, totalCompanies });
};

exports.showVerify       = (req, res) => res.render('verify',          { hideNav: true, csrfToken: res.locals.csrfToken });
exports.showForgot       = (req, res) => res.render('forgot-password', { showLoginBtn: true, showRegisterBtn: true, csrfToken: res.locals.csrfToken });
exports.showResetPassword = (req, res) => res.render('reset-password', { showLoginBtn: true, showRegisterBtn: true, token: req.query.token || '', csrfToken: res.locals.csrfToken });


exports.login = async (req, res, next) => {
    const email = (req.body.email || '').toLowerCase();

    if (await isLocked(email)) {
        req.flash('error_msg', 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em 15 minutos.');
        return res.redirect('/login');
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            recordFailure(email).catch(() => {});
            req.flash('error_msg', info.message || 'E-mail ou senha incorretos.');
            return res.redirect('/login');
        }

        // Regenera o session ID para evitar session fixation
        const remember = req.body.remember;
        req.session.regenerate((err) => {
            if (err) return next(err);
            req.login(user, (err) => {
                if (err) return next(err);
                clearFailures(email).catch(() => {});
                req.session.loginAt = Date.now();   // usado para validar sessão após reset de senha
                auditLog(AUDIT_ACTIONS.LOGIN, req, { userId: user.id });
                if (remember) {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                } else {
                    req.session.cookie.expires = false;
                }
                const redirect = req.query.redirect || req.body.redirect || '/';
                return res.redirect(safePath(redirect));
            });
        });
    })(req, res, next);
};

exports.register = async (req, res) => {
    const { name, email, password, confirm_password, userType } = req.body;

    if (password !== confirm_password) {
        req.flash('error_msg', 'As senhas não coincidem.');
        return res.redirect('/register');
    }

    try {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            req.flash('error_msg', 'Este e-mail já está registrado.');
            return res.redirect('/register');
        }

        const verificationCode        = crypto.randomInt(100000, 999999).toString();
        const verificationCodeExpires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        // A senha vai em texto puro: o hook beforeCreate do model faz o hash (bcrypt 12).
        const newUser = await User.create({
            name: name.trim(), email, password, userType,
            isRecruiter: userType === 'empresa',
            isVerified: false, verificationCode, verificationCodeExpires
        });

        const safeName = escapeHtml(name.trim());
        transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      email,
            subject: 'Código de Verificação - LinkUp',
            html:    `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#e53935;">LinkUp</h2><p>Olá, <strong>${safeName}</strong>!</p><p>Seu código de verificação é:</p><h1 style="letter-spacing:8px;color:#e53935;">${verificationCode}</h1><p style="color:#888;">Válido por ${CODE_EXPIRY_MINUTES} minutos.</p><p style="color:#888;">Se você não criou esta conta, ignore este e-mail.</p></div>`
        }, (error) => { if (error) logger.warn('authController', 'Erro ao enviar e-mail de verificação', { err: error.message }); });

        auditLog(AUDIT_ACTIONS.REGISTER, req, { userType });

        req.login(newUser, (err) => {
            if (err) return res.redirect('/login');
            req.flash('success_msg', `Bem-vindo, ${name.trim()}! Verifique o código no seu e-mail. Expira em ${CODE_EXPIRY_MINUTES} minutos.`);
            return res.redirect('/verify');
        });
    } catch (err) {
        logger.error('authController', 'Erro no registro', { err: err.message });
        req.flash('error_msg', 'Erro interno. Tente novamente.');
        res.redirect('/register');
    }
};

exports.verify = async (req, res) => {
    const { code } = req.body;
    try {
        const user = await User.findOne({ where: { id: req.user.id, verificationCode: code } });
        if (!user) { req.flash('error_msg', 'Código inválido. Tente novamente.'); return res.redirect('/verify'); }
        if (user.verificationCodeExpires && new Date() > new Date(user.verificationCodeExpires)) {
            req.flash('error_msg', 'Código expirado. Solicite um novo.');
            return res.redirect('/verify');
        }
        user.isVerified = true;
        user.verificationCode = null;
        user.verificationCodeExpires = null;
        await user.save();
        auditLog(AUDIT_ACTIONS.VERIFY, req, { email: user.email });
        req.flash('success_msg', 'Conta verificada! Bem-vindo ao LinkUp 🎉');
        return res.redirect('/');
    } catch (err) {
        logger.error('authController', 'Erro na verificação de código', { err: err.message });
        res.redirect('/verify');
    }
};

exports.resendCode = async (req, res) => {
    try {
        if (!req.user || req.user.isVerified) return res.json({ ok: false, error: 'Conta já verificada.' });

        const newCode    = crypto.randomInt(100000, 999999).toString();
        const newExpires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        await User.update(
            { verificationCode: newCode, verificationCodeExpires: newExpires },
            { where: { id: req.user.id } }
        );

        transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      req.user.email,
            subject: 'Novo código de verificação — LinkUp',
            html:    `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#e53935;">LinkUp</h2><p>Olá, <strong>${escapeHtml(req.user.name)}</strong>!</p><p>Seu novo código de verificação é:</p><h1 style="letter-spacing:8px;color:#e53935;">${newCode}</h1><p style="color:#888;">Válido por ${CODE_EXPIRY_MINUTES} minutos.</p></div>`
        }, (err) => { if (err) logger.warn('authController', 'Erro ao reenviar código', { err: err.message }); });

        res.json({ ok: true });
    } catch (err) {
        logger.error('authController', 'Erro ao reenviar código', { err: err.message });
        res.json({ ok: false, error: 'Erro interno.' });
    }
};

// Gera hash do token de reset para armazenar no banco (nunca o token cru).
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    // Resposta sempre genérica para não permitir enumeração de e-mails cadastrados.
    const genericMsg = 'Se esse e-mail estiver cadastrado, você receberá um link de recuperação em instantes.';
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            req.flash('success_msg', genericMsg);
            return res.redirect('/forgot-password');
        }
        // Token aleatório forte (256 bits). Só o hash é persistido; o token cru
        // vai apenas no link enviado por e-mail — elimina brute-force.
        const rawToken = crypto.randomBytes(32).toString('hex');
        user.resetToken        = hashToken(rawToken);
        user.resetTokenExpires = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);
        await user.save();

        const link = `${baseUrl(req)}/reset-password?token=${rawToken}`;
        transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      email,
            subject: 'Recuperação de Senha - LinkUp',
            html:    `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#e53935;">LinkUp</h2><p>Recebemos um pedido para redefinir sua senha. Clique no botão abaixo:</p><p style="text-align:center;margin:28px 0;"><a href="${link}" style="background:#e63946;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Redefinir senha</a></p><p style="color:#888;font-size:.85rem;">Ou copie e cole este link no navegador:<br><span style="color:#666;word-break:break-all;">${link}</span></p><p style="color:#888;">Válido por ${RESET_EXPIRY_MINUTES} minutos. Se você não solicitou isso, ignore este e-mail.</p></div>`
        }, (error) => { if (error) logger.warn('authController', 'Erro ao enviar e-mail de reset', { err: error.message }); });

        req.flash('success_msg', genericMsg);
        res.redirect('/forgot-password');
    } catch (err) {
        logger.error('authController', 'Erro no forgot-password', { err: err.message });
        req.flash('success_msg', genericMsg);
        res.redirect('/forgot-password');
    }
};

exports.resetPassword = async (req, res) => {
    const { token, password, confirm_password } = req.body;
    const backToForm = token ? `/reset-password?token=${encodeURIComponent(token)}` : '/forgot-password';
    if (!token) { req.flash('error_msg', 'Link de redefinição inválido. Solicite um novo.'); return res.redirect('/forgot-password'); }
    if (password !== confirm_password) { req.flash('error_msg', 'As senhas não coincidem.'); return res.redirect(backToForm); }
    if (!password || password.length < 8) { req.flash('error_msg', 'A senha deve ter pelo menos 8 caracteres.'); return res.redirect(backToForm); }
    try {
        const { Op } = require('sequelize');
        const user = await User.findOne({
            where: {
                resetToken: hashToken(token),
                resetTokenExpires: { [Op.gt]: new Date() }
            }
        });
        if (!user) { req.flash('error_msg', 'Link inválido ou expirado. Solicite um novo.'); return res.redirect('/forgot-password'); }

        // Senha em texto puro: o hook beforeUpdate do model faz o hash (bcrypt 12).
        user.password          = password;
        user.resetToken        = null;
        user.resetTokenExpires = null;
        user.passwordChangedAt = new Date();   // invalida sessões abertas antes desta data
        await user.save();
        auditLog(AUDIT_ACTIONS.RESET_PASSWORD, req, { email: maskEmail(user.email) });
        req.flash('success_msg', 'Senha alterada com sucesso! Faça login.');
        res.redirect('/login');
    } catch (err) {
        logger.error('authController', 'Erro no reset-password', { err: err.message });
        res.redirect('/forgot-password');
    }
};

exports.logout = (req, res, next) => {
    auditLog(AUDIT_ACTIONS.LOGOUT, req);
    req.logout((err) => {
        if (err) return next(err);
        // Destrói a sessão no servidor e limpa o cookie — impede reuso do token
        req.session.destroy((err) => {
            if (err) return next(err);
            res.clearCookie('connect.sid');
            res.redirect('/login');
        });
    });
};

exports.onboardingComplete = async (req, res) => {
    try {
        await User.update({ onboardingComplete: true }, { where: { id: req.user.id } });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
};

exports.dismissChecklist = async (req, res) => {
    try {
        await User.update({ checklistDismissed: true }, { where: { id: req.user.id } });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
};

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const passport = require('passport');
const { User, Job } = require('../models');
const { auditLog, AUDIT_ACTIONS } = require('../middleware/auditLog');
const logger  = require('../helpers/logger');
const transporter = require('../helpers/mailer');

const CODE_EXPIRY_MINUTES = 15;

// ─── Account lockout (in-memory, single-instance) ────────────────────────────
// Chave: email em lowercase. Valor: { attempts, lockedUntil }
const loginFailures = new Map();
const MAX_FAILURES   = 5;
const LOCKOUT_MS     = 15 * 60 * 1000; // 15 minutos

function recordFailure(email) {
    const key  = email.toLowerCase();
    const rec  = loginFailures.get(key) || { attempts: 0, lockedUntil: null };
    rec.attempts += 1;
    if (rec.attempts >= MAX_FAILURES) rec.lockedUntil = Date.now() + LOCKOUT_MS;
    loginFailures.set(key, rec);
}

function isLocked(email) {
    const rec = loginFailures.get(email.toLowerCase());
    if (!rec || !rec.lockedUntil) return false;
    if (Date.now() > rec.lockedUntil) { loginFailures.delete(email.toLowerCase()); return false; }
    return true;
}

function clearFailures(email) {
    loginFailures.delete(email.toLowerCase());
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
exports.showResetPassword = (req, res) => res.render('reset-password', { showLoginBtn: true, showRegisterBtn: true, csrfToken: res.locals.csrfToken });


exports.login = (req, res, next) => {
    const email = (req.body.email || '').toLowerCase();

    if (isLocked(email)) {
        req.flash('error_msg', 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em 15 minutos.');
        return res.redirect('/login');
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            recordFailure(email);
            req.flash('error_msg', info.message || 'E-mail ou senha incorretos.');
            return res.redirect('/login');
        }

        // Regenera o session ID para evitar session fixation
        const remember = req.body.remember;
        req.session.regenerate((err) => {
            if (err) return next(err);
            req.login(user, (err) => {
                if (err) return next(err);
                clearFailures(email);
                req.session.loginAt = Date.now();   // usado para validar sessão após reset de senha
                auditLog(AUDIT_ACTIONS.LOGIN, req, { userId: user.id });
                if (remember) {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                } else {
                    req.session.cookie.expires = false;
                }
                const redirect    = req.query.redirect || req.body.redirect || '/';
                const safeRedirect = redirect.startsWith('/') ? redirect : '/';
                return res.redirect(safeRedirect);
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

        const salt                    = await bcrypt.genSalt(10);
        const hashedPassword          = await bcrypt.hash(password, salt);
        const verificationCode        = crypto.randomInt(100000, 999999).toString();
        const verificationCodeExpires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        const newUser = await User.create({
            name: name.trim(), email, password: hashedPassword, userType,
            isRecruiter: userType === 'empresa',
            isVerified: false, verificationCode, verificationCodeExpires
        });

        transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      email,
            subject: 'Código de Verificação - LinkUp',
            html:    `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#e53935;">LinkUp</h2><p>Olá, <strong>${name.trim()}</strong>!</p><p>Seu código de verificação é:</p><h1 style="letter-spacing:8px;color:#e53935;">${verificationCode}</h1><p style="color:#888;">Válido por ${CODE_EXPIRY_MINUTES} minutos.</p><p style="color:#888;">Se você não criou esta conta, ignore este e-mail.</p></div>`
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
            html:    `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#e53935;">LinkUp</h2><p>Olá, <strong>${req.user.name}</strong>!</p><p>Seu novo código de verificação é:</p><h1 style="letter-spacing:8px;color:#e53935;">${newCode}</h1><p style="color:#888;">Válido por ${CODE_EXPIRY_MINUTES} minutos.</p></div>`
        }, (err) => { if (err) logger.warn('authController', 'Erro ao reenviar código', { err: err.message }); });

        res.json({ ok: true });
    } catch (err) {
        logger.error('authController', 'Erro ao reenviar código', { err: err.message });
        res.json({ ok: false, error: 'Erro interno.' });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            req.flash('success_msg', 'Se esse e-mail estiver cadastrado, você receberá um código em instantes.');
            return res.redirect('/forgot-password');
        }
        const resetCode               = crypto.randomInt(100000, 999999).toString();
        const verificationCodeExpires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
        user.verificationCode        = resetCode;
        user.verificationCodeExpires = verificationCodeExpires;
        await user.save();

        transporter.sendMail({
            from:    `"LinkUp" <${process.env.GMAIL_USER}>`,
            to:      email,
            subject: 'Recuperação de Senha - LinkUp',
            html:    `<div style="font-family:sans-serif;max-width:480px;margin:auto;"><h2 style="color:#e53935;">LinkUp</h2><p>Seu código de recuperação é:</p><h1 style="letter-spacing:8px;color:#e53935;">${resetCode}</h1><p style="color:#888;">Válido por ${CODE_EXPIRY_MINUTES} minutos.</p><p style="color:#888;">Se você não solicitou isso, ignore este e-mail.</p></div>`
        }, (error) => { if (error) logger.warn('authController', 'Erro ao enviar e-mail de reset', { err: error.message }); });

        req.flash('success_msg', 'Código enviado para o seu e-mail.');
        res.redirect('/reset-password');
    } catch (err) {
        logger.error('authController', 'Erro no forgot-password', { err: err.message });
        res.redirect('/forgot-password');
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, password, confirm_password } = req.body;
    if (password !== confirm_password) { req.flash('error_msg', 'As senhas não coincidem.'); return res.redirect('/reset-password'); }
    if (password.length < 8) { req.flash('error_msg', 'A senha deve ter pelo menos 8 caracteres.'); return res.redirect('/reset-password'); }
    try {
        const user = await User.findOne({ where: { email, verificationCode: code } });
        if (!user) { req.flash('error_msg', 'E-mail ou código inválidos.'); return res.redirect('/reset-password'); }
        if (user.verificationCodeExpires && new Date() > new Date(user.verificationCodeExpires)) {
            req.flash('error_msg', 'Código expirado. Solicite um novo.');
            return res.redirect('/forgot-password');
        }
        const salt = await bcrypt.genSalt(10);
        user.password             = await bcrypt.hash(password, salt);
        user.verificationCode     = null;
        user.verificationCodeExpires = null;
        user.passwordChangedAt    = new Date();   // invalida sessões abertas antes desta data
        await user.save();
        auditLog(AUDIT_ACTIONS.RESET_PASSWORD, req, { email: maskEmail(email) });
        req.flash('success_msg', 'Senha alterada com sucesso! Faça login.');
        res.redirect('/login');
    } catch (err) {
        logger.error('authController', 'Erro no reset-password', { err: err.message });
        res.redirect('/reset-password');
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

function ensureGuest(req, res, next) {
    if (req.isAuthenticated()) return res.redirect('/');
    next();
}

function ensureAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        req.flash('error_msg', 'Por favor, faça login para acessar esta página.');
        return res.redirect('/login');
    }

    // Invalida sessões abertas antes de um reset de senha.
    // Se passwordChangedAt existir e for posterior ao loginAt da sessão → força novo login.
    const passwordChangedAt = req.user.passwordChangedAt
        ? new Date(req.user.passwordChangedAt).getTime()
        : null;
    const loginAt = req.session.loginAt || 0;

    if (passwordChangedAt && passwordChangedAt > loginAt) {
        req.session.destroy(() => {});
        req.flash('error_msg', 'Sua senha foi alterada. Por favor, faça login novamente.');
        return res.redirect('/login');
    }

    next();
}

function ensureCompany(req, res, next) {
    if (req.isAuthenticated() && req.user.userType === 'empresa') return next();
    req.flash('error_msg', 'Apenas contas de empresa podem realizar esta ação.');
    res.redirect('/');
}

module.exports = { ensureGuest, ensureAuthenticated, ensureCompany };

function ensureGuest(req, res, next) {
    if (req.isAuthenticated()) return res.redirect('/');
    next();
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash('error_msg', 'Por favor, faça login para acessar esta página.');
    res.redirect('/login');
}

function ensureCompany(req, res, next) {
    if (req.isAuthenticated() && req.user.userType === 'empresa') return next();
    req.flash('error_msg', 'Apenas contas de empresa podem realizar esta ação.');
    res.redirect('/');
}

module.exports = { ensureGuest, ensureAuthenticated, ensureCompany };

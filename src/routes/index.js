const { ensureAuthenticated }      = require('../middleware/auth');
const { aiLimiter, aiGlobalLimiter } = require('../middleware/Ratelimiter');

// Caminhos liberados mesmo para usuário autenticado ainda não verificado.
const VERIFY_EXEMPT = new Set([
    '/verify', '/resend-code', '/logout',
    '/onboarding/complete', '/onboarding/checklist/dismiss'
]);

// Força a confirmação de e-mail antes de usar a aplicação. Só afeta usuários
// logados e não verificados — visitantes não são impactados.
function ensureVerified(req, res, next) {
    if (req.user && !req.user.isVerified && !VERIFY_EXEMPT.has(req.path)) {
        const isAjax = req.xhr || (req.headers.accept || '').includes('application/json');
        if (isAjax) return res.status(403).json({ error: 'Confirme seu e-mail para continuar.' });
        req.flash('error_msg', 'Confirme seu e-mail para acessar essa área.');
        return res.redirect('/verify');
    }
    next();
}

module.exports = function mountRoutes(app) {
    const AI_PATHS = ['/jobs/ai', '/jobs/compare-candidates', '/resume/ai', '/interview', '/tailoring', '/bias'];
    app.use(AI_PATHS, aiLimiter, aiGlobalLimiter);

    app.use(require('./auth'));
    app.use(ensureVerified);
    app.use('/',              require('./home'));
    app.use('/jobs',          require('./jobs'));
    app.use('/jobs',          require('./chat'));
    app.use('/profile',       require('./profile'));
    app.use('/resume',        ensureAuthenticated, require('./resume'));
    app.use('/notifications', require('./notifications'));
    app.use('/interview',     require('./interview'));
    app.use('/tailoring',     require('./tailoring'));
    app.use('/bias',          require('./biasAudit'));
    app.use('/searches',      require('./savedSearches'));
    app.use('/ai-metrics',    require('./aiMetrics'));
};

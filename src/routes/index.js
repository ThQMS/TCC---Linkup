const { ensureAuthenticated } = require('../middleware/auth');
const { aiLimiter }           = require('../middleware/Ratelimiter');

module.exports = function mountRoutes(app) {
    app.use(['/jobs/ai', '/jobs/compare-candidates', '/resume/ai', '/interview', '/tailoring', '/bias'], aiLimiter);

    app.use(require('./auth'));
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

const express = require('express');
const path    = require('path');
const logger  = require('./src/helpers/logger');

const app = express();

require('./src/config/handlebars')(app);

app.use(require('morgan')(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(require('helmet')({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "blob:"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc:      ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc:       ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc:        ["'self'", "data:", "blob:", "https:"],
            connectSrc:    ["'self'", "https://cdn.jsdelivr.net", "https://servicodados.ibge.gov.br"],
            frameSrc:      ["'none'"],
            objectSrc:     ["'none'"]
        }
    },
    frameguard:     { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts:           process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false
}));
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(require('cookie-parser')());
app.use(express.static(path.join(__dirname, 'public')));
app.use(require('./src/middleware/Validation').sanitizeInputs);

const sessionMiddleware = require('./src/config/session')(app);

require('./src/config/connection').connect()
    .catch(err => logger.error('db', 'Erro ao conectar ao banco', { err: err.message }));

require('./src/routes')(app);
require('./src/jobs');

app.use((req, res) => res.status(404).render('404', { layout: false }));

app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        const isAjax = req.xhr || (req.headers.accept || '').includes('application/json') || (req.headers['content-type'] || '').includes('application/json');
        if (isAjax) return res.status(403).json({ error: 'Token de segurança expirado. Recarregue a página.' });
        req.flash('error_msg', 'Token de segurança expirado. Tente novamente.');
        return res.redirect('back');
    }
    logger.error('app', 'Erro não tratado', { err: err.message, stack: err.stack });
    res.status(500).render('500', { layout: false });
});

module.exports = { app, sessionMiddleware };

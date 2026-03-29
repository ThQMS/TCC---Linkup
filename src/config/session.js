const session    = require('express-session');
const flash      = require('connect-flash');
const passport   = require('passport');
const { doubleCsrf } = require('csrf-csrf');
const globalLocals   = require('../middleware/globalLocals');

module.exports = function setupSession(app) {
    const sessionMiddleware = session({
        secret:            process.env.SESSION_SECRET,
        resave:            false,
        saveUninitialized: false,
        cookie: {
            sameSite: 'lax',
            secure:   process.env.NODE_ENV === 'production',
            httpOnly: true
        }
    });

    app.use(sessionMiddleware);
    app.use(flash());
    app.use(passport.initialize());
    app.use(passport.session());
    require('./passport')(passport);

    const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
        getSecret:               () => process.env.SESSION_SECRET || 'linkup-csrf-secret',
        getSessionIdentifier:    (req) => req.session.id,
        cookieName:              'x-csrf-token',
        cookieOptions:           { sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true },
        getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body._csrf
    });
    app.use(doubleCsrfProtection);
    app.use(globalLocals(generateCsrfToken));

    return sessionMiddleware;
};

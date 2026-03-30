const { Notification } = require('../models');

module.exports = function globalLocals(generateCsrfToken) {
    return async (req, res, next) => {
        // Garante que o session ID seja estável entre GET e POST (necessário para o CSRF)
        if (req.session && !req.session._init) req.session._init = true;

        res.locals.success_msg = req.flash('success_msg');
        res.locals.error_msg   = req.flash('error_msg');
        res.locals.warning_msg = req.flash('warning_msg');
        res.locals.error       = req.flash('error');
        res.locals.user        = req.user ? req.user.toJSON() : null;
        res.locals.csrfToken   = generateCsrfToken(req, res);

        if (req.user) {
            try {
                res.locals.unreadNotifications = await Notification.count({
                    where: { userId: req.user.id, read: false }
                });
            } catch { res.locals.unreadNotifications = 0; }
        } else {
            res.locals.unreadNotifications = 0;
        }

        next();
    };
};

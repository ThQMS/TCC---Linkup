// Audit log de ações críticas
const logger = require('../helpers/logger');

const AUDIT_ACTIONS = {
    LOGIN:           'LOGIN',
    LOGOUT:          'LOGOUT',
    REGISTER:        'REGISTER',
    VERIFY:          'VERIFY_EMAIL',
    RESET_PASSWORD:  'RESET_PASSWORD',
    CHANGE_PASSWORD: 'CHANGE_PASSWORD',
    DELETE_ACCOUNT:  'DELETE_ACCOUNT',
    JOB_CREATE:      'JOB_CREATE',
    JOB_DELETE:      'JOB_DELETE',
    APPLICATION:     'APPLICATION_SUBMIT',
    STATUS_CHANGE:   'APPLICATION_STATUS_CHANGE'
};

/**
 * Mascara e-mail para logs: "joao.silva@gmail.com" → "jo***@gmail.com"
 * Preserva domínio (útil para diagnóstico) sem expor o endereço completo.
 */
function maskEmail(email) {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const visible = local.slice(0, 2);
    return `${visible}***@${domain}`;
}

function auditLog(action, req, extra = {}) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || 'unknown';

    // e-mail mascarado — nunca persiste o endereço completo em logs
    const entry = {
        action,
        userId:    req.user?.id              || null,
        userEmail: maskEmail(req.user?.email) || null,
        ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date().toISOString(),
        ...extra
    };

    logger.info('audit', JSON.stringify(entry));
}

module.exports = { auditLog, AUDIT_ACTIONS };
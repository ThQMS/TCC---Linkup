/**
 * Logger estruturado (JSON Lines) — sem dependências externas.
 * Saída: {"ts":"...","level":"error","ctx":"profileController","msg":"...","meta":{...}}
 *
 * Nível configurável via variável de ambiente LOG_LEVEL (error|warn|info|debug).
 * Default: info em produção, debug em desenvolvimento.
 */

const LEVELS   = { error: 0, warn: 1, info: 2, debug: 3 };
const envLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const maxLevel = LEVELS[envLevel] ?? 2;

function log(level, ctx, msg, meta) {
    if ((LEVELS[level] ?? 2) > maxLevel) return;

    const entry = { ts: new Date().toISOString(), level, ctx, msg };
    if (meta !== undefined) entry.meta = meta;

    const line = JSON.stringify(entry) + '\n';
    level === 'error' ? process.stderr.write(line) : process.stdout.write(line);
}

module.exports = {
    error: (ctx, msg, meta) => log('error', ctx, msg, meta),
    warn:  (ctx, msg, meta) => log('warn',  ctx, msg, meta),
    info:  (ctx, msg, meta) => log('info',  ctx, msg, meta),
    debug: (ctx, msg, meta) => log('debug', ctx, msg, meta),
};

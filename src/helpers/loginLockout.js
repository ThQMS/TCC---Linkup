// Lockout de login por conta (e-mail) com backend Redis.
// Em produção multi-instância o estado precisa ser compartilhado — um Map em
// memória por processo é contornável (cada instância tem o seu) e some no restart.
// Se o Redis estiver indisponível, cai num Map local (best-effort) para não
// travar o login em dev/local.
const { client } = require('../config/redis');
const logger = require('./logger');

const MAX_FAILURES = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutos

const memFallback = new Map();

function key(email) {
    return `login:fail:${email.toLowerCase()}`;
}

async function recordFailure(email) {
    const k = key(email);
    try {
        const attempts = await client.incr(k);
        // expira a janela de contagem; quando estoura o limite, estende o bloqueio
        await client.expire(k, LOCKOUT_SECONDS);
        return attempts;
    } catch (err) {
        logger.warn('loginLockout', 'Redis indisponível, usando fallback em memória', { err: err.message });
        const rec = memFallback.get(k) || { attempts: 0, lockedUntil: 0 };
        rec.attempts += 1;
        if (rec.attempts >= MAX_FAILURES) rec.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
        memFallback.set(k, rec);
        return rec.attempts;
    }
}

async function isLocked(email) {
    const k = key(email);
    try {
        const attempts = parseInt(await client.get(k), 10) || 0;
        return attempts >= MAX_FAILURES;
    } catch {
        const rec = memFallback.get(k);
        if (!rec || !rec.lockedUntil) return false;
        if (Date.now() > rec.lockedUntil) { memFallback.delete(k); return false; }
        return true;
    }
}

async function clearFailures(email) {
    const k = key(email);
    try {
        await client.del(k);
    } catch {
        memFallback.delete(k);
    }
}

module.exports = { recordFailure, isLocked, clearFailures, MAX_FAILURES };

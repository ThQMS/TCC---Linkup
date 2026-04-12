const Redis  = require('ioredis');
const logger = require('../helpers/logger');

function createClient() {
    const c = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        lazyConnect:          true,
        maxRetriesPerRequest: null,  // não lança MaxRetriesPerRequestError
        retryStrategy: (times) => {
            if (times > 5) return null; // para de reconectar após 5 tentativas
            return Math.min(times * 300, 3000);
        }
    });
    c.on('connect', () => logger.info('redis', 'Conectado ao Redis'));
    c.on('error',   (err) => logger.error('redis', 'Erro de conexão Redis', { err: err.message }));
    return c;
}

const client = createClient();

module.exports = { client, createClient };

const { Server }        = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { client: redisClient, createClient } = require('./redis');
const logger            = require('../helpers/logger');

/**
 * Configura o Socket.io no servidor HTTP com Redis adapter.
 * Compartilha a sessão Express para autenticar o userId via sessão
 * (nunca via dados enviados pelo cliente).
 *
 * O Redis adapter permite que eventos Socket.io propaguen entre múltiplas
 * instâncias do servidor (horizontal scaling).
 *
 * @param {http.Server}      server            - Servidor HTTP do Express
 * @param {Function}         sessionMiddleware - Middleware de sessão Express
 * @returns {{ io: Server, userSockets: Map }}
 */
function setupSocket(server, sessionMiddleware) {
    const io = new Server(server, {
        cors: { origin: process.env.BASE_URL || 'http://localhost:3000' }
    });

    // Ativa Redis adapter somente se Redis estiver disponível.
    // Em dev sem Redis o Socket.io funciona in-process normalmente.
    redisClient.ping()
        .then(() => {
            const subClient = createClient();
            io.adapter(createAdapter(redisClient, subClient));
            logger.info('socket', 'Socket.io usando Redis adapter');
        })
        .catch(() => {
            logger.warn('socket', 'Redis indisponível — Socket.io rodando in-process (single instance)');
        });

    const userSockets = new Map();

    io.use((socket, next) => {
        sessionMiddleware(socket.request, socket.request.res || {}, next);
    });

    io.on('connection', (socket) => {
        const userId = socket.request.session?.passport?.user;
        if (userId) userSockets.set(String(userId), socket.id);

        socket.on('disconnect', () => {
            for (const [uid, sid] of userSockets.entries()) {
                if (sid === socket.id) { userSockets.delete(uid); break; }
            }
        });
    });

    return { io, userSockets };
}

module.exports = setupSocket;

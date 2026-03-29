const { Server } = require('socket.io');

/**
 * Configura o Socket.io no servidor HTTP.
 * Compartilha a sessão Express para autenticar o userId via sessão
 * (nunca via dados enviados pelo cliente).
 *
 * @param {http.Server}      server            - Servidor HTTP do Express
 * @param {Function}         sessionMiddleware - Middleware de sessão Express
 * @returns {{ io: Server, userSockets: Map }}
 */
function setupSocket(server, sessionMiddleware) {
    const io          = new Server(server, {
        cors: { origin: process.env.BASE_URL || 'http://localhost:3000' }
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

require('dotenv').config();
require('./src/config/startup').validateEnv();
const http        = require('http');
const { app, sessionMiddleware } = require('./app');
const setupSocket = require('./src/config/socket');
const logger      = require('./src/helpers/logger');

const PORT   = process.env.PORT || 3000;
const server = http.createServer(app);

const { io, userSockets } = setupSocket(server, sessionMiddleware);
app.set('io', io);
app.set('userSockets', userSockets);

server.listen(PORT, () => {
    logger.info('server', `Servidor rodando na porta ${PORT}`);
});

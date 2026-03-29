function sendSocketNotification(app, userId, payload) {
    const io          = app.get('io');
    const userSockets = app.get('userSockets');
    if (!io || !userSockets) return;
    const socketId = userSockets.get(String(userId));
    if (socketId) io.to(socketId).emit('notification', payload);
}

module.exports = sendSocketNotification;

const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const { ensureAuthenticated } = require('../middleware/auth');
const logger = require('../helpers/logger');

// GET /notifications
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    // Marca todas como lidas
    await Notification.update(
      { read: true },
      { where: { userId: req.user.id, read: false } }
    );

    res.render('notifications', {
    notifications: notifications.map(n => n.toJSON()),
    csrfToken: res.locals.csrfToken
});
  } catch (err) {
    logger.error('notifications', 'Erro ao carregar notificações', { err: err.message });
    req.flash('error_msg', 'Erro ao carregar notificações.');
    res.redirect('/');
  }
});

// POST /notifications/delete/:id
router.post('/delete/:id', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.destroy({ where: { id: req.params.id, userId: req.user.id } });
    res.redirect('/notifications');
  } catch (err) {
    res.redirect('/notifications');
  }
});

// POST /notifications/clear-all
router.post('/clear-all', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.destroy({ where: { userId: req.user.id } });
    res.redirect('/notifications');
  } catch (err) {
    res.redirect('/notifications');
  }
});

module.exports = router;
const express = require('express');
const router  = require('express').Router();
const chat    = require('../controllers/chatController');
const { ensureAuthenticated } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/Ratelimiter');

router.post('/:id/chat',      ensureAuthenticated, aiLimiter, chat.chat);
router.get('/:id/chat/ping',  ensureAuthenticated,            chat.ping);

module.exports = router;

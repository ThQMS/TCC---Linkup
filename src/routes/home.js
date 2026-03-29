const express  = require('express');
const router   = express.Router();
const home     = require('../controllers/homeController');
const { contactLimiter } = require('../middleware/Ratelimiter');

router.get('/',             home.home);
router.get('/landing',      home.landing);
router.get('/help',         home.help);
router.get('/guia',         (req, res) => res.redirect(301, '/help#guia'));
router.post('/help/contact', contactLimiter, home.helpContact);

module.exports = router;

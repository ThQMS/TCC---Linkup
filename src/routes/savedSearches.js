const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/savedSearchesController');
const { ensureAuthenticated } = require('../middleware/auth');

router.post('/save',             ensureAuthenticated, ctrl.save);
router.get('/',                  ensureAuthenticated, ctrl.list);
router.post('/toggle-alert/:id', ensureAuthenticated, ctrl.toggleAlert);
router.post('/delete/:id',       ensureAuthenticated, ctrl.remove);

module.exports = router;

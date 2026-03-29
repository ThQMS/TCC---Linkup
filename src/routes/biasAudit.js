const express      = require('express');
const router       = express.Router();
const bias         = require('../controllers/biasAuditController');
const { ensureAuthenticated, ensureCompany } = require('../middleware/auth');

router.post('/audit', ensureAuthenticated, ensureCompany, bias.audit);

module.exports = router;

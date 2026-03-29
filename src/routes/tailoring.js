const express   = require('express');
const router    = express.Router();
const tailoring = require('../controllers/tailoringController');
const { ensureAuthenticated } = require('../middleware/auth');

router.post('/:jobId', ensureAuthenticated, tailoring.tailor);

module.exports = router;

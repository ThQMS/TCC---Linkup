const express   = require('express');
const router    = express.Router();
const interview = require('../controllers/interviewController');
const { ensureAuthenticated } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/Ratelimiter');

router.post('/:jobId/start',  ensureAuthenticated, aiLimiter, interview.start);
router.post('/:jobId/answer', ensureAuthenticated, aiLimiter, interview.answer);
router.post('/:jobId/score',  ensureAuthenticated, aiLimiter, interview.score);

module.exports = router;

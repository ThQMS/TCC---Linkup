const express  = require('express');
const router   = express.Router();
const { validateLogin, validateRegister, handleValidationErrors } = require('../middleware/Validation');
const validateCompany = require('../middleware/validateCompany');
const { loginLimiter, registerLimiter, verifyLimiter, resetLimiter } = require('../middleware/Ratelimiter');
const { ensureGuest, ensureAuthenticated } = require('../middleware/auth');
const auth = require('../controllers/authController');

router.get('/login',          ensureGuest, auth.showLogin);
router.get('/register',       ensureGuest, auth.showRegister);
router.get('/verify',                      auth.showVerify);
router.get('/forgot-password', ensureGuest, auth.showForgot);
router.get('/reset-password',  ensureGuest, auth.showResetPassword);
router.get('/logout',                      auth.logout);

router.post('/login',    loginLimiter,    validateLogin,    (req, res, next) => handleValidationErrors(req, res, next, '/login'),    auth.login);
router.post('/register', ensureGuest, registerLimiter, validateRegister, validateCompany, (req, res, next) => handleValidationErrors(req, res, next, '/register'), auth.register);
router.post('/verify',        verifyLimiter, auth.verify);
router.post('/resend-code',   verifyLimiter, auth.resendCode);
router.post('/forgot-password', resetLimiter, auth.forgotPassword);
router.post('/reset-password',  resetLimiter, auth.resetPassword);
router.post('/onboarding/complete',          ensureAuthenticated, auth.onboardingComplete);
router.post('/onboarding/checklist/dismiss', ensureAuthenticated, auth.dismissChecklist);

module.exports = router;

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const { ensureAuthenticated, ensureCompany } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/Ratelimiter');
const { validateProfile, handleValidationErrors } = require('../middleware/Validation');
const profile  = require('../controllers/profileController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
        ok ? cb(null, true) : cb(new Error('Apenas imagens JPG, PNG ou WEBP.'));
    }
});

router.use((req, res, next) => {
    if (req.user && !req.user.isVerified) return res.redirect('/verify');
    next();
});

router.get('/',                    ensureAuthenticated,              profile.getProfile);
router.get('/my-jobs',             ensureAuthenticated, ensureCompany, profile.getMyJobs);
router.get('/dashboard',           ensureAuthenticated,              profile.getDashboard);
router.get('/dashboard/pdf',       ensureAuthenticated, ensureCompany, profile.getDashboardPdf);
router.get('/empresa/:id',                                            profile.getEmpresaPublica);
router.post('/avatar',             ensureAuthenticated, uploadLimiter, upload.single('avatar'), profile.postAvatar);
router.post('/update',             ensureAuthenticated, validateProfile, (req, res, next) => handleValidationErrors(req, res, next, '/profile'), profile.postUpdate);
router.get('/candidate/dashboard', ensureAuthenticated,              profile.getCandidateDashboard);
router.post('/availability-status', ensureAuthenticated,              profile.postAvailabilityStatus);
router.get('/c/:name',                                                profile.getPublicCandidate);

module.exports = router;

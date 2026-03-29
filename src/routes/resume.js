const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const { ensureAuthenticated } = require('../middleware/auth');
const resume   = require('../controllers/resumeController');

const ALLOWED_MIME = 'application/pdf';
const ALLOWED_EXT  = '.pdf';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (file.mimetype !== ALLOWED_MIME || ext !== ALLOWED_EXT) {
            return cb(new Error('Apenas arquivos PDF são aceitos.'));
        }
        cb(null, true);
    }
});

router.get('/create',          ensureAuthenticated, resume.getCreate);
router.post('/save',           ensureAuthenticated, resume.postSave);
router.get('/view',            ensureAuthenticated, resume.getView);
router.post('/ai/improve',     ensureAuthenticated, resume.postAiImprove);

router.post('/ai/import', ensureAuthenticated, (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Arquivo muito grande. Limite de 5MB.' });
        }
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, resume.postAiImport);

router.post('/tailoring/apply', ensureAuthenticated, resume.postTailoringApply);

module.exports = router;

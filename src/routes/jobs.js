const express = require('express');
const router  = express.Router();
const { ensureAuthenticated, ensureCompany } = require('../middleware/auth');
const { validateJob, handleValidationErrors } = require('../middleware/Validation');
const jobs = require('../controllers/jobsController');

router.get('/add',        ensureAuthenticated, ensureCompany, jobs.showAdd);
router.post('/add',       ensureAuthenticated, ensureCompany, validateJob, (req, res, next) => handleValidationErrors(req, res, next, '/jobs/add'), jobs.create);
router.get('/view/:id',   jobs.view);
router.get('/edit/:id',   ensureAuthenticated, ensureCompany, jobs.showEdit);
router.post('/update',    ensureAuthenticated, ensureCompany, validateJob, (req, res, next) => handleValidationErrors(req, res, next, '/jobs/edit/' + req.body.id), jobs.update);
router.post('/delete/:id', ensureAuthenticated, ensureCompany, jobs.destroy);

router.get('/login-to-apply/:id',   jobs.loginToApply);
router.post('/apply/:id',           ensureAuthenticated, jobs.apply);
router.post('/applications/status',    ensureAuthenticated, ensureCompany, jobs.changeApplicationStatus);
router.post('/applications/stage',     ensureAuthenticated, ensureCompany, jobs.updateStage);
router.post('/close/:id',              ensureAuthenticated, ensureCompany, jobs.closeJobWithFeedback);
router.get('/applications/:id',        ensureAuthenticated, ensureCompany, jobs.listApplications);
router.get('/my-applications',      ensureAuthenticated, jobs.myApplications);
router.get('/my-applications/pdf',  ensureAuthenticated, jobs.myApplicationsPdf);

router.post('/favorite/:id',           ensureAuthenticated, jobs.toggleFavorite);
router.get('/favorites',               ensureAuthenticated, jobs.favorites);
router.post('/block-company/:companyId', ensureAuthenticated, jobs.blockCompany);

router.get( '/talents/:id',                            ensureAuthenticated, ensureCompany, jobs.getTalents);
router.get( '/similar-candidates/:id',                 ensureAuthenticated, ensureCompany, jobs.getSimilarCandidates);
router.post('/reactivate-contact/:jobId/:candidateId', ensureAuthenticated, ensureCompany, jobs.reactivateContact);

router.get( '/suggested-candidates/:jobId',            ensureAuthenticated, ensureCompany, jobs.getSuggestedCandidates);
router.post('/contact-suggested/:jobId/:candidateId',  ensureAuthenticated, ensureCompany, jobs.contactSuggested);

router.post('/ai/cover-letter/:id',    ensureAuthenticated, jobs.coverLetter);
router.post('/ai/improve',             ensureAuthenticated, ensureCompany, jobs.improveJob);
router.post('/ai/stages',              ensureAuthenticated, ensureCompany, jobs.suggestStages);
router.post('/ai/compatibility/:jobId', ensureAuthenticated, jobs.compatibility);
router.post('/ai/rank/:jobId',         ensureAuthenticated, ensureCompany, jobs.rank);
router.post('/compare-candidates',     ensureAuthenticated, ensureCompany, jobs.compareCandidates);

module.exports = router;

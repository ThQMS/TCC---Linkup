const { Job, User, Resume } = require('../models');
const parseResume           = require('../helpers/parseResume');
const handlebarsHelpers     = require('../helpers/handlebars-helpers');
const transporter           = require('../helpers/mailer');
const logger                = require('../helpers/logger');
const { getBlockedCompanyIds, searchJobs, attachBadges, getSuggestions, buildPagination } = require('../services/searchService');

exports.landing = async (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/');
    try {
        const [totalJobs, totalCompanies, totalCandidates] = await Promise.all([
            Job.count(),
            User.count({ where: { userType: 'empresa' } }),
            User.count({ where: { userType: 'candidato' } })
        ]);
        res.render('landing', { layout: false, totalJobs, totalCompanies, totalCandidates });
    } catch (err) {
        res.render('landing', { layout: false, totalJobs: 0, totalCompanies: 0, totalCandidates: 0 });
    }
};

exports.home = async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/landing');
    if (req.user && !req.user.isVerified) return res.redirect('/verify');

    const search   = req.query.job;
    const modality = req.query.modality;
    const salary   = req.query.salary;
    const city     = req.query.city;
    const skill    = req.query.skill;
    const isPcd    = req.query.isPcd === '1';
    const page     = parseInt(req.query.page, 10) || 1;

    try {
        const isCandidate      = req.user.userType === 'candidato';
        const hasNoFilters     = !search && !modality && !salary && !city && !skill && !isPcd && page === 1;
        const blockedCompanyIds = await getBlockedCompanyIds(req.user);

        const { rows, totalCount, semanticUsed } = await searchJobs({ search, modality, city, salary, skill, isPcd, page, blockedCompanyIds });
        const jobsWithBadge = await attachBadges(rows);
        const pagination    = buildPagination({ page, totalCount, search, modality, salary, city, skill, isPcd });

        let candidateResume = null;
        if (isCandidate) {
            try { candidateResume = await Resume.findOne({ where: { userId: req.user.id } }); } catch (e) {}
        }

        let suggestedJobs = [];
        if (isCandidate && hasNoFilters) {
            suggestedJobs = await getSuggestions(req.user, candidateResume);
        }

        let userSkills = '[]';
        if (isCandidate && candidateResume) {
            try { userSkills = handlebarsHelpers.safeJson(parseResume(candidateResume).skills); } catch (e) {}
        }

        res.render('index', {
            jobs: jobsWithBadge,
            suggestedJobs, hasSuggestions: suggestedJobs.length > 0,
            search, modality: modality || 'todos', salary: salary || 'todos',
            city: city || 'todos', skill: skill || 'todos', isPcd,
            currentPage: page, totalJobs: totalCount,
            isCandidate, userSkills, semanticUsed,
            ...pagination
        });
    } catch (err) {
        logger.error('homeController', 'Erro ao buscar vagas', { err: err.message });
        res.render('index', { jobs: [], suggestedJobs: [], search, error: 'Erro ao carregar vagas.' });
    }
};

exports.help = (req, res) => res.render('help');

exports.guia = (req, res) => res.render('guia');

exports.helpContact = async (req, res) => {
    const { name, email, message } = req.body;
    try {
        await transporter.sendMail({
            from:    `"LinkUp Help" <${process.env.GMAIL_USER}>`,
            to:      process.env.GMAIL_USER,
            subject: `[LinkUp Help] ${name}`,
            html:    `<p><strong>${name}</strong> (${email})</p><p>${message}</p>`
        });
        req.flash('success_msg', 'Mensagem enviada!');
    } catch (e) {
        logger.warn('homeController', 'Erro ao enviar mensagem de contato', { err: e.message });
        req.flash('error_msg', 'Erro ao enviar mensagem.');
    }
    res.redirect('/help');
};

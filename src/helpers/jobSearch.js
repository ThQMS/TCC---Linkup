const { Op } = require('sequelize');
const { Job } = require('../models');
const parseResume = require('./parseResume');
const logger = require('./logger');

async function semanticSearch(query, jobs) {
    try {
        const response = await fetch((process.env.SEARCH_SERVICE_URL || 'http://localhost:5001') + '/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                jobs: jobs.map(j => ({
                    id:           j.id,
                    title:        j.title        || '',
                    description:  j.description  || '',
                    requirements: j.requirements || '',
                    benefits:     j.benefits     || '',
                    differential: j.differential || '',
                    company:      j.company      || '',
                    modality:     j.modality     || '',
                    city:         j.city         || ''
                })),
                limit: 50
            }),
            signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        logger.warn('jobSearch', 'Microserviço Python indisponível, usando busca SQL padrão');
        return null;
    }
}

async function getSuggestedJobs(resume, appliedJobIds = []) {
    try {
        if (!resume) return [];
        const { skills, experiences, education, summary } = parseResume(resume);

        // Hard skills get highest weight (3x)
        const skillKeywords = skills
            .map(s => s.toLowerCase().trim())
            .filter(s => s.length > 2);

        // Experiência: títulos de cargo para match com job title (2x)
        const roleKeywords = experiences
            .map(e => e.role)
            .filter(Boolean)
            .map(r => r.toLowerCase().trim())
            .filter(r => r.length > 2);

        // Palavras gerais: formação, empresa, resumo (1x)
        const generalKeywords = [
            ...experiences.map(e => e.company),
            ...education.map(e => e.course),
            summary
        ].join(' ').toLowerCase().split(/[\s,;\/\-\(\)]+/).map(w => w.trim()).filter(w => w.length > 3);

        if (skillKeywords.length === 0 && roleKeywords.length === 0 && generalKeywords.length === 0) return [];

        const allJobs = await Job.findAll({
            where: { status: 'aberta', id: { [Op.notIn]: appliedJobIds.length > 0 ? appliedJobIds : [0] } },
            order: [['createdAt', 'DESC']],
            limit: 100
        });

        const scored = allJobs.map(job => {
            const jobTitle    = (job.title        || '').toLowerCase();
            const jobBody     = [job.description, job.requirements, job.benefits, job.differential].join(' ').toLowerCase();
            const jobFullText = jobTitle + ' ' + jobBody;

            // Skills: +3 se aparece no título da vaga, +2 se aparece no body
            const skillScore = skillKeywords.reduce((acc, kw) =>
                acc + (jobTitle.includes(kw) ? 3 : jobBody.includes(kw) ? 2 : 0), 0);

            // Roles: +2 por palavra do cargo que aparece no título da vaga
            const titleScore = roleKeywords.reduce((acc, role) => {
                const words = role.split(/\s+/).filter(w => w.length > 2);
                return acc + words.filter(w => jobTitle.includes(w)).length * 2;
            }, 0);

            // Geral: +1 por match em qualquer campo
            const generalScore = generalKeywords.reduce((acc, kw) =>
                acc + (jobFullText.includes(kw) ? 1 : 0), 0);

            return { job: job.toJSON(), score: skillScore + titleScore + generalScore };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.job);
    } catch (err) {
        logger.error('jobSearch', 'Erro ao gerar sugestões de vagas', { err: err.message });
        return [];
    }
}

module.exports = { semanticSearch, getSuggestedJobs };

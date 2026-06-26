const { Op } = require('sequelize');
const { Job } = require('../models');
const parseResume = require('./parseResume');
const logger = require('./logger');

const SEARCH_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:5001';

// Header de autenticação compartilhada Node↔Python (opcional — só envia se configurado)
function searchHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (process.env.SEARCH_TOKEN) h['x-search-token'] = process.env.SEARCH_TOKEN;
    return h;
}

async function semanticSearch(query, jobs) {
    try {
        const response = await fetch(SEARCH_URL + '/search', {
            method: 'POST',
            headers: searchHeaders(),
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

async function getSuggestedJobs(resume, appliedJobIds = [], candidateIsPcd = false) {
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

        if (skillKeywords.length === 0 && roleKeywords.length === 0) return [];

        const allJobs = await Job.findAll({
            where: {
                status: 'aberta',
                id: { [Op.notIn]: appliedJobIds.length > 0 ? appliedJobIds : [0] },
                ...(!candidateIsPcd ? { isPcd: false } : {})
            },
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

            return { job: job.toJSON(), score: skillScore + titleScore };
        });

        return scored
            .filter(s => s.score >= 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.job);
    } catch (err) {
        logger.error('jobSearch', 'Erro ao gerar sugestões de vagas', { err: err.message });
        return [];
    }
}

/**
 * Invalida o embedding em cache de uma vaga no microserviço Python.
 * Fire-and-forget: chamado ao editar/excluir vaga para o ranking semântico não
 * servir conteúdo obsoleto. Falha silenciosamente se o serviço estiver fora.
 */
async function invalidateJobCache(jobId) {
    try {
        await fetch(`${SEARCH_URL}/invalidate/${parseInt(jobId, 10)}`, {
            method: 'POST',
            headers: searchHeaders(),
            signal: AbortSignal.timeout(2000)
        });
    } catch {
        logger.debug('jobSearch', 'Falha ao invalidar cache de embedding (serviço offline?)', { jobId });
    }
}

module.exports = { semanticSearch, getSuggestedJobs, invalidateJobCache };

const { Op, literal } = require('sequelize');
const { Job, Resume, Application } = require('../models');
const UserBlock = require('../models/UserBlock');
const { semanticSearch, getSuggestedJobs } = require('../helpers/jobSearch');
const { getResponsiveCompanies } = require('./responsividadeService');

const LIMIT = 8;

/**
 * Returns blockedCompanyIds for a candidate user, or [] for empresa/unauthenticated.
 */
async function getBlockedCompanyIds(user) {
    if (!user || user.userType !== 'candidato') return [];
    try {
        const blocks = await UserBlock.findAll({ where: { userId: user.id }, attributes: ['companyId'] });
        return blocks.map(b => b.companyId);
    } catch (e) { return []; }
}

/**
 * Runs the full search (semantic → SQL fallback) and returns { rows, totalCount, semanticUsed }.
 */
async function searchJobs({ search, modality, city, salary, skill, page, blockedCompanyIds }) {
    const offset = (page - 1) * LIMIT;
    let filteredRows = [];
    let totalCount   = 0;
    let semanticUsed = false;

    if (search && search.trim().length >= 2) {
        const baseWhere = {
            status: 'aberta',
            ...(modality && modality !== 'todos' ? { modality } : {}),
            ...(city && city !== 'todos' ? { city: { [Op.like]: `%${city}%` } } : {}),
            ...(blockedCompanyIds.length > 0 ? { UserId: { [Op.notIn]: blockedCompanyIds } } : {})
        };

        const allOpenJobs = await Job.findAll({
            where: baseWhere,
            attributes: ['id', 'title', 'description', 'requirements', 'benefits', 'differential', 'company', 'modality', 'city', 'salary'],
            limit: 200,
            order: [['createdAt', 'DESC']]
        });

        const semantic = await semanticSearch(search, allOpenJobs.map(j => j.toJSON()));

        if (semantic && semantic.ids && semantic.ids.length > 0) {
            semanticUsed = true;
            totalCount   = semantic.ids.length;

            const pagedIds = semantic.ids.slice(offset, offset + LIMIT)
                .map(id => parseInt(id, 10)).filter(Number.isFinite);

            if (pagedIds.length > 0) {
                filteredRows = await Job.findAll({
                    where: { id: { [Op.in]: pagedIds } },
                    order: literal(`array_position(ARRAY[${pagedIds.join(',')}]::int[], id)`)
                });
            }
        }
    }

    if (!semanticUsed) {
        const conditions = [];
        if (search)   conditions.push({ [Op.or]: [{ title: { [Op.like]: `%${search}%` } }, { company: { [Op.like]: `%${search}%` } }] });
        if (modality && modality !== 'todos') conditions.push({ modality });
        if (city     && city     !== 'todos') conditions.push({ city: { [Op.like]: `%${city}%` } });
        if (blockedCompanyIds.length > 0)     conditions.push({ UserId: { [Op.notIn]: blockedCompanyIds } });

        const whereClause = conditions.length > 0 ? { [Op.and]: conditions } : {};
        const { count, rows } = await Job.findAndCountAll({ where: whereClause, order: [['createdAt', 'DESC']], limit: LIMIT, offset });

        totalCount   = count;
        filteredRows = rows;

        // Salary range filter
        if (salary && salary !== 'todos') {
            const ranges = { 'ate-5000': [0, 5000], '5000-8000': [5000, 8000], '8000-12000': [8000, 12000], 'acima-12000': [12000, 999999] };
            const range  = ranges[salary];
            if (range) {
                function parseSalaryMin(s) { if (!s) return 0; const n = s.replace(/\./g, '').match(/\d+/g); return n ? parseInt(n[0], 10) : 0; }
                filteredRows = filteredRows.filter(j => { const min = parseSalaryMin(j.salary); return min >= range[0] && min <= range[1]; });
            }
        }

        // Skill keyword filter
        if (skill && skill !== 'todos') {
            filteredRows = filteredRows.filter(j => {
                const text = [j.title, j.description, j.requirements].join(' ').toLowerCase();
                return text.includes(skill.toLowerCase());
            });
        }
    }

    return { rows: filteredRows, totalCount, semanticUsed };
}

/**
 * Attaches empresaResponsiva badge to job rows.
 */
async function attachBadges(rows) {
    const companyUserIds = [...new Set(rows.map(j => (j.toJSON ? j.toJSON() : j).UserId).filter(Boolean))];
    const responsiveCompanies = await getResponsiveCompanies(companyUserIds);
    return rows.map(job => ({
        ...(job.toJSON ? job.toJSON() : job),
        empresaResponsiva: responsiveCompanies.has((job.toJSON ? job.toJSON() : job).UserId)
    }));
}

/**
 * Returns suggested jobs for a candidate (only when no active filters, page 1).
 */
async function getSuggestions(user, candidateResume) {
    try {
        const applications = await Application.findAll({ where: { userId: user.id }, attributes: ['jobId'] });
        return getSuggestedJobs(candidateResume, applications.map(a => a.jobId));
    } catch (e) { return []; }
}

/**
 * Builds pagination data.
 */
function buildPagination({ page, totalCount, search, modality, salary, city, skill }) {
    const totalPages    = Math.ceil(totalCount / LIMIT);
    const searchParam   = search   ? `&job=${search}`       : '';
    const modalityParam = modality && modality !== 'todos' ? `&modality=${modality}` : '';
    const salaryParam   = salary   && salary   !== 'todos' ? `&salary=${salary}`     : '';
    const cityParam     = city     && city     !== 'todos' ? `&city=${city}`         : '';
    const skillParam    = skill    && skill    !== 'todos' ? `&skill=${skill}`       : '';
    const extraParams   = `${searchParam}${modalityParam}${salaryParam}${cityParam}${skillParam}`;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        pages.push({ number: i, active: i === page, url: `/?page=${i}${extraParams}` });
    }

    return {
        totalPages,
        pages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        prevUrl: `/?page=${page - 1}${extraParams}`,
        nextUrl: `/?page=${page + 1}${extraParams}`
    };
}

module.exports = { getBlockedCompanyIds, searchJobs, attachBadges, getSuggestions, buildPagination };

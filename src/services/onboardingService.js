const { Op } = require('sequelize');
const { Resume, Application, Favorite, AiLog, Job } = require('../models');

// ---------------------------------------------------------------------------
// Definição dos itens por tipo de usuário
// ---------------------------------------------------------------------------

const CANDIDATO_ITEMS = [
    { key: 'perfil',      label: 'Completar seu perfil',              href: '/profile',              icon: 'bi-person-check-fill' },
    { key: 'curriculo',   label: 'Criar seu currículo',               href: '/resume/create',        icon: 'bi-file-earmark-person-fill' },
    { key: 'candidatura', label: 'Candidatar-se a uma vaga',          href: '/',                     icon: 'bi-send-fill' },
    { key: 'ia',          label: 'Usar IA (compatibilidade ou chat)', href: '/',                     icon: 'bi-robot' },
    { key: 'favorito',    label: 'Salvar uma vaga nos favoritos',     href: '/jobs/favorites',       icon: 'bi-heart-fill' },
];

const EMPRESA_ITEMS = [
    { key: 'perfil',       label: 'Configurar perfil da empresa',         href: '/profile',           icon: 'bi-building-fill-check' },
    { key: 'vaga',         label: 'Criar sua primeira vaga',              href: '/jobs/add',          icon: 'bi-briefcase-fill' },
    { key: 'ia',           label: 'Usar IA (bias audit ou ranking)',      href: '/',                  icon: 'bi-robot' },
    { key: 'candidaturas', label: 'Analisar candidaturas recebidas',      href: '/profile/dashboard', icon: 'bi-people-fill' },
    { key: 'metricas',     label: 'Explorar métricas de IA',              href: '/ai-metrics',        icon: 'bi-graph-up-arrow' },
    { key: 'etapas',       label: 'Definir etapas do processo seletivo',  href: '/jobs/add',          icon: 'bi-list-check' },
    { key: 'status',       label: 'Atualizar status de um candidato',      href: '/profile/my-jobs',   icon: 'bi-person-check-fill', tip: 'Alimenta métricas do dashboard e garante o Selo Empresa Responsiva.' },
];

// ---------------------------------------------------------------------------
// Verificação dinâmica de cada item contra o banco
// ---------------------------------------------------------------------------

async function checkItem(key, user, isCandidato) {
    try {
        if (isCandidato) {
            switch (key) {
                case 'perfil':
                    return !!(user.bio && user.bio.trim() && user.city);
                case 'curriculo':
                    return !!(await Resume.findOne({ where: { userId: user.id }, attributes: ['id'] }));
                case 'candidatura':
                    return (await Application.count({ where: { userId: user.id } })) > 0;
                case 'ia':
                    return (await AiLog.count({ where: { userId: user.id } })) > 0;
                case 'favorito':
                    return (await Favorite.count({ where: { userId: user.id } })) > 0;
            }
        } else {
            switch (key) {
                case 'perfil':
                    return !!(user.bio && user.bio.trim() && user.sector);
                case 'vaga':
                    return (await Job.count({ where: { UserId: user.id } })) > 0;
                case 'ia':
                    return (await AiLog.count({ where: { userId: user.id } })) > 0;
                case 'candidaturas': {
                    const jobs = await Job.findAll({ where: { UserId: user.id }, attributes: ['id'] });
                    if (!jobs.length) return false;
                    return (await Application.count({ where: { jobId: jobs.map(j => j.id) } })) > 0;
                }
                case 'metricas':
                    // Marcado como feito assim que o usuário tiver qualquer log de IA
                    return (await AiLog.count({ where: { userId: user.id } })) > 0;
                case 'etapas': {
                    // Empresa configurou perguntas/etapas em pelo menos uma vaga
                    const job = await Job.findOne({
                        where: {
                            UserId:    user.id,
                            questions: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '[]' }] }
                        },
                        attributes: ['id']
                    });
                    return !!job;
                }
                case 'status': {
                    // Empresa atualizou status de pelo menos um candidato (saiu de 'pendente')
                    const jobs = await Job.findAll({ where: { UserId: user.id }, attributes: ['id'] });
                    if (!jobs.length) return false;
                    return (await Application.count({
                        where: {
                            jobId:  { [Op.in]: jobs.map(j => j.id) },
                            status: { [Op.notIn]: ['pendente'] }
                        }
                    })) > 0;
                }
            }
        }
    } catch (_) {
        return false;
    }
    return false;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Retorna o status completo do checklist de onboarding para um usuário.
 * Computa tudo dinamicamente — sem estado salvo por item.
 *
 * @param {object} user - objeto user já serializado (toJSON)
 * @returns {{ items, completed, total, allDone, shouldShow }}
 */
async function getChecklistStatus(user) {
    // Checklist só aparece para usuários verificados
    if (!user.isVerified) return _emptyChecklist();

    const isCandidato = user.userType === 'candidato';
    const template    = isCandidato ? CANDIDATO_ITEMS : EMPRESA_ITEMS;

    const doneFlags = await Promise.all(template.map(item => checkItem(item.key, user, isCandidato)));

    const items     = template.map((item, i) => ({ ...item, done: doneFlags[i] }));
    const completed = items.filter(i => i.done).length;
    const total     = items.length;
    const allDone   = completed === total;

    return {
        items,
        completed,
        total,
        allDone,
        progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        // Mostra o card se: não foi dispensado E ainda há itens pendentes
        shouldShow: !user.checklistDismissed && !allDone,
    };
}

function _emptyChecklist() {
    return { items: [], completed: 0, total: 0, allDone: false, shouldShow: false };
}

module.exports = { getChecklistStatus };

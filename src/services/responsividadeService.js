/**
 * Lógica centralizada do Selo Empresa Responsiva.
 * Critérios: taxa de resposta >= 80% E tempo médio de resposta <= 7 dias.
 */
const { Op } = require('sequelize');
const { Job, Application } = require('../models');
const logger = require('../helpers/logger');

/**
 * Calcula métricas de responsividade para uma lista de applications já carregadas.
 * @param {Array} apps - candidaturas (com status, createdAt, updatedAt)
 * @returns {{ taxaResposta: number, tempoMedio: number, empresaResponsiva: boolean }}
 */
function calcularMetricas(apps) {
    const total = apps.length;
    if (total === 0) return { taxaResposta: 0, tempoMedio: 0, empresaResponsiva: false };

    const respondidas  = apps.filter(a => ['aprovado','rejeitado','expirado'].includes(a.status));
    const taxaResposta = Math.round((respondidas.length / total) * 100);

    let tempoMedio = 0;
    if (respondidas.length > 0) {
        const totalDias = respondidas.reduce((sum, a) =>
            sum + Math.floor((new Date(a.updatedAt) - new Date(a.createdAt)) / 86400000), 0);
        tempoMedio = Math.round(totalDias / respondidas.length);
    }

    return {
        taxaResposta,
        tempoMedio,
        empresaResponsiva: taxaResposta >= 80 && tempoMedio <= 7
    };
}

/**
 * Retorna Set com os UserId das empresas que atendem ao critério Empresa Responsiva.
 * Usada na listagem principal de vagas para enriquecer cada card.
 * @param {number[]} userIds - IDs das empresas donas das vagas exibidas
 * @returns {Promise<Set<number>>}
 */
async function getResponsiveCompanies(userIds) {
    if (!userIds || userIds.length === 0) return new Set();
    try {
        // Busca todas as vagas das empresas em 1 query
        const jobs = await Job.findAll({
            where: { UserId: { [Op.in]: userIds } },
            attributes: ['id', 'UserId']
        });
        if (jobs.length === 0) return new Set();

        const jobIds      = jobs.map(j => j.id);
        const jobOwnerMap = Object.fromEntries(jobs.map(j => [j.id, j.UserId]));

        // Busca todas as candidaturas em 1 query
        const apps = await Application.findAll({
            where: { jobId: { [Op.in]: jobIds } },
            attributes: ['jobId', 'status', 'createdAt', 'updatedAt']
        });

        // Agrupa por empresa
        const appsPorEmpresa = {};
        for (const app of apps) {
            const uid = jobOwnerMap[app.jobId];
            if (!appsPorEmpresa[uid]) appsPorEmpresa[uid] = [];
            appsPorEmpresa[uid].push(app);
        }

        const responsive = new Set();
        for (const userId of userIds) {
            const { empresaResponsiva } = calcularMetricas(appsPorEmpresa[userId] || []);
            if (empresaResponsiva) responsive.add(userId);
        }
        return responsive;
    } catch (e) {
        logger.error('responsividadeService', 'Erro ao calcular métricas de responsividade', { err: e.message });
        return new Set();
    }
}

module.exports = { calcularMetricas, getResponsiveCompanies };

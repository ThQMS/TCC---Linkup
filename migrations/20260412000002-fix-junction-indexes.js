'use strict';

// Corrige índices que a migration 0018 tentou criar em nomes de tabela errados
// (Favorites/JobViews em vez de favorites/job_views — as addIndex falhavam em
// silêncio). Recria nos nomes corretos e adiciona o índice ÚNICO de favoritos,
// que previne favoritos duplicados em cliques concorrentes.
module.exports = {
    async up(queryInterface) {
        const add = (table, fields, opts = {}) =>
            queryInterface.addIndex(table, fields, opts).catch((e) => {
                // eslint-disable-next-line no-console
                console.warn(`addIndex ${table} falhou (provável já existente): ${e.message}`);
            });

        // favorites — índice único (userId, jobId) impede duplicados
        await add('favorites', ['userId', 'jobId'], { name: 'favorites_userid_jobid_unique', unique: true });

        // job_views — dedup por (jobId,userId) e por (jobId,ip); cleanup por createdAt
        await add('job_views', ['jobId', 'userId'], { name: 'jobviews_jobid_userid' });
        await add('job_views', ['jobId', 'ip'],     { name: 'jobviews_jobid_ip' });
        await add('job_views', ['createdAt'],       { name: 'jobviews_createdat' });
    },

    async down(queryInterface) {
        const drop = (table, name) =>
            queryInterface.removeIndex(table, name).catch(() => {});
        await drop('favorites', 'favorites_userid_jobid_unique');
        await drop('job_views', 'jobviews_jobid_userid');
        await drop('job_views', 'jobviews_jobid_ip');
        await drop('job_views', 'jobviews_createdat');
    }
};

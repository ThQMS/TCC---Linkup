'use strict';

module.exports = {
    async up(queryInterface) {
        const add = (table, fields, opts = {}) =>
            queryInterface.addIndex(table, fields, opts).catch(() => {});

        // JobViews — findOrCreate(jobId+userId) e findOne(jobId+ip)
        await add('JobViews', ['jobId', 'userId'], { name: 'jobviews_jobid_userid' });
        await add('JobViews', ['jobId', 'ip'],     { name: 'jobviews_jobid_ip' });
        await add('JobViews', ['createdAt'],        { name: 'jobviews_createdat' }); // cleanup job

        // Favorites — findOne(userId+jobId) e findAll(userId)
        await add('Favorites', ['userId', 'jobId'], { name: 'favorites_userid_jobid' });

        // UserBlocks — findOne(userId+companyId) e findAll(userId)
        await add('UserBlocks', ['userId', 'companyId'], { name: 'userblocks_userid_companyid' });

        // SavedSearches — todas as queries filtram por userId
        await add('SavedSearches', ['userId'], { name: 'savedsearches_userid' });

        // Applications — createdAt usado nos cron jobs (expiração dia 7, 21)
        await add('Applications', ['status', 'createdAt'], { name: 'applications_status_createdat' });
    },

    async down(queryInterface) {
        const drop = (table, name) =>
            queryInterface.removeIndex(table, name).catch(() => {});

        await drop('JobViews',      'jobviews_jobid_userid');
        await drop('JobViews',      'jobviews_jobid_ip');
        await drop('JobViews',      'jobviews_createdat');
        await drop('Favorites',     'favorites_userid_jobid');
        await drop('UserBlocks',    'userblocks_userid_companyid');
        await drop('SavedSearches', 'savedsearches_userid');
        await drop('Applications',  'applications_status_createdat');
    }
};

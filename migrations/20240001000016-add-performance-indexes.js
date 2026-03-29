'use strict';

module.exports = {
    async up(queryInterface) {
        const add = (table, fields, opts = {}) =>
            queryInterface.addIndex(table, fields, opts).catch(() => {});

        await add('Applications', ['userId']);
        await add('Applications', ['jobId']);
        await add('Applications', ['status']);
        await add('Jobs',         ['UserId']);
        await add('Jobs',         ['status']);
        await add('Jobs',         ['UserId', 'status'], { name: 'jobs_userid_status' });
        await add('AiLogs',       ['userId']);
        await add('AiLogs',       ['feature']);
        await add('Notifications', ['userId', 'read'], { name: 'notifications_userid_read' });
        await add('Resumes',      ['userId'], { unique: true, name: 'resumes_userid_unique' }).catch(() => {});
    },

    async down(queryInterface) {
        const drop = (table, name) =>
            queryInterface.removeIndex(table, name).catch(() => {});

        await drop('Applications', 'applications_user_id');
        await drop('Applications', 'applications_job_id');
        await drop('Applications', 'applications_status');
        await drop('Jobs',         'jobs_user_id');
        await drop('Jobs',         'jobs_status');
        await drop('Jobs',         'jobs_userid_status');
        await drop('AiLogs',       'ai_logs_user_id');
        await drop('AiLogs',       'ai_logs_feature');
        await drop('Notifications', 'notifications_userid_read');
        await drop('Resumes',      'resumes_userid_unique');
    }
};

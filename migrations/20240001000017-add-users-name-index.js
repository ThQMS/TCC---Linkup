'use strict';

module.exports = {
    async up(queryInterface) {
        await queryInterface.addIndex('Users', ['name'], {
            name: 'users_name_search'
        }).catch(() => {});
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('Users', 'users_name_search').catch(() => {});
    }
};

'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const table = await queryInterface.describeTable('jobs');
        if (!table['rediscoveryData']) {
            await queryInterface.addColumn('jobs', 'rediscoveryData', {
                type:      Sequelize.TEXT,
                allowNull: true,
                defaultValue: null
            });
        }
    },
    down: async (queryInterface) => {
        try { await queryInterface.removeColumn('jobs', 'rediscoveryData'); } catch (e) {}
    }
};

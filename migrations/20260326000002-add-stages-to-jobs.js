'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('jobs', 'stages', {
            type: Sequelize.TEXT,
            allowNull: true,
            defaultValue: '[]'
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('jobs', 'stages');
    }
};

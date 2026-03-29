'use strict';
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Applications', 'reminderSent', {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: true
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('Applications', 'reminderSent');
    }
};
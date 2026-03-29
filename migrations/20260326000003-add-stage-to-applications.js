'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Applications', 'currentStage', {
            type:         Sequelize.STRING,
            allowNull:    true,
            defaultValue: null
        });
        await queryInterface.addColumn('Applications', 'stageHistory', {
            type:         Sequelize.TEXT,
            allowNull:    true,
            defaultValue: '[]'
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('Applications', 'currentStage');
        await queryInterface.removeColumn('Applications', 'stageHistory');
    }
};

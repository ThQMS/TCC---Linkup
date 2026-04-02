'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('Users');

        if (!tableInfo.isPcd) {
            await queryInterface.addColumn('Users', 'isPcd', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            });
        }

        if (!tableInfo.pcdType) {
            await queryInterface.addColumn('Users', 'pcdType', {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: null
            });
        }
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('Users', 'isPcd');
        await queryInterface.removeColumn('Users', 'pcdType');
    }
};

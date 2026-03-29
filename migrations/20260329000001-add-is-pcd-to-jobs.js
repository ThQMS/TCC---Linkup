'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('jobs');
    if (!tableInfo.isPcd) {
      await queryInterface.addColumn('jobs', 'isPcd', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('jobs', 'isPcd');
  }
};

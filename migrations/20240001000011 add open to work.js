'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('Users');
    if (!tableDesc['openToWork']) {
        await queryInterface.addColumn('Users', 'openToWork', {
            type: Sequelize.BOOLEAN, defaultValue: false
        });
    }
  },
  down: async (queryInterface) => {
    try { await queryInterface.removeColumn('Users', 'openToWork'); } catch(e) {}
  }
};
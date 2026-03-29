'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('jobs');
    if (!table['questions']) {
      await queryInterface.addColumn('jobs', 'questions', {
        type: Sequelize.TEXT, defaultValue: '[]'
      });
    }
  },
  down: async (queryInterface) => {
    try { await queryInterface.removeColumn('jobs', 'questions'); } catch(e) {}
  }
};
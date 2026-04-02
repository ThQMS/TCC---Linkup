'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Applications');
    if (table['canceledAt']) return; // coluna já existe, nada a fazer

    await queryInterface.addColumn('Applications', 'canceledAt', {
      type:         Sequelize.DATE,
      allowNull:    true,
      defaultValue: null,
      after:        'stageHistory'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Applications', 'canceledAt');
  }
};

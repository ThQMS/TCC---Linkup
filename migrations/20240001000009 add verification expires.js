'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('Users');
    if (!tableDesc['verificationCodeExpires']) {
      await queryInterface.addColumn('Users', 'verificationCodeExpires', {
        type: Sequelize.DATE, allowNull: true
      });
    }
  },
  down: async (queryInterface) => {
    try { await queryInterface.removeColumn('Users', 'verificationCodeExpires'); } catch(e) {}
  }
};
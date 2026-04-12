'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'passwordChangedAt', {
      type:         Sequelize.DATE,
      allowNull:    true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'passwordChangedAt');
  }
};

'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('AiLogs', {
      id:         { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      feature:    { type: Sequelize.STRING, allowNull: false },
      userId:     { type: Sequelize.INTEGER, allowNull: true },
      success:    { type: Sequelize.BOOLEAN, defaultValue: true },
      durationMs: { type: Sequelize.INTEGER, allowNull: true },
      error:      { type: Sequelize.TEXT, allowNull: true },
      createdAt:  { type: Sequelize.DATE, allowNull: false },
      updatedAt:  { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('AiLogs');
  }
};
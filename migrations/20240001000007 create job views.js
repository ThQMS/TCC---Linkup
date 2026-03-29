'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('job_views', {
      id:        { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      jobId:     { type: Sequelize.INTEGER, allowNull: false, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      userId:    { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      ip:        { type: Sequelize.STRING, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('job_views');
  }
};
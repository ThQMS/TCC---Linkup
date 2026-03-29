'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('jobs', {
      id:           { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      title:        { type: Sequelize.STRING, allowNull: false },
      description:  { type: Sequelize.TEXT, allowNull: false },
      salary:       { type: Sequelize.STRING, allowNull: true },
      company:      { type: Sequelize.STRING, allowNull: false },
      email:        { type: Sequelize.STRING, allowNull: true },
      new_job:      { type: Sequelize.BOOLEAN, defaultValue: true },
      UserId:       { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      modality:     { type: Sequelize.STRING, allowNull: true },
      requirements: { type: Sequelize.TEXT, allowNull: true },
      benefits:     { type: Sequelize.TEXT, allowNull: true },
      differential: { type: Sequelize.TEXT, allowNull: true },
      status:       { type: Sequelize.STRING, allowNull: false, defaultValue: 'aberta' },
      city:         { type: Sequelize.STRING, allowNull: true },
      type:         { type: Sequelize.STRING, allowNull: true },
      views:        { type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt:    { type: Sequelize.DATE, allowNull: false },
      updatedAt:    { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('jobs');
  }
};
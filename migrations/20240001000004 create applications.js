'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Applications', {
      id:          { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      userId:      { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      jobId:       { type: Sequelize.INTEGER, allowNull: false, references: { model: 'jobs', key: 'id' }, onDelete: 'CASCADE' },
      status:      { type: Sequelize.ENUM('pendente','em análise','aprovado','rejeitado'), defaultValue: 'pendente' },
      coverLetter: { type: Sequelize.TEXT, allowNull: true },
      createdAt:   { type: Sequelize.DATE, allowNull: false },
      updatedAt:   { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Applications');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Applications_status";');
  }
};
'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Resumes', {
      id:             { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      userId:         { type: Sequelize.INTEGER, allowNull: false, unique: true, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      phone:          { type: Sequelize.STRING, allowNull: true },
      city:           { type: Sequelize.STRING, allowNull: true },
      birthDate:      { type: Sequelize.STRING, allowNull: true },
      address:        { type: Sequelize.STRING, allowNull: true },
      linkedin:       { type: Sequelize.STRING, allowNull: true },
      github:         { type: Sequelize.STRING, allowNull: true },
      summary:        { type: Sequelize.TEXT, allowNull: true },
      experiences:    { type: Sequelize.TEXT, allowNull: true, defaultValue: '[]' },
      education:      { type: Sequelize.TEXT, allowNull: true, defaultValue: '[]' },
      skills:         { type: Sequelize.TEXT, allowNull: true, defaultValue: '[]' },
      languages:      { type: Sequelize.TEXT, allowNull: true },
      certifications: { type: Sequelize.TEXT, allowNull: true },
      pdfPath:        { type: Sequelize.STRING, allowNull: true },
      createdAt:      { type: Sequelize.DATE, allowNull: false },
      updatedAt:      { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Resumes');
  }
};
'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Users', {
      id:                 { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name:               { type: Sequelize.STRING, allowNull: false },
      email:              { type: Sequelize.STRING, allowNull: false, unique: true },
      password:           { type: Sequelize.STRING, allowNull: false },
      userType:           { type: Sequelize.STRING, allowNull: false, defaultValue: 'candidato' },
      isVerified:         { type: Sequelize.BOOLEAN, defaultValue: false },
      verificationCode:   { type: Sequelize.STRING, allowNull: true },
      isRecruiter:        { type: Sequelize.BOOLEAN, defaultValue: false },
      bio:                { type: Sequelize.TEXT, allowNull: true },
      city:               { type: Sequelize.STRING, allowNull: true },
      phone:              { type: Sequelize.STRING, allowNull: true },
      github:             { type: Sequelize.STRING, allowNull: true },
      linkedin:           { type: Sequelize.STRING, allowNull: true },
      website:            { type: Sequelize.STRING, allowNull: true },
      linkedinCompany:    { type: Sequelize.STRING, allowNull: true },
      sector:             { type: Sequelize.STRING, allowNull: true },
      companySize:        { type: Sequelize.STRING, allowNull: true },
      avatar:             { type: Sequelize.STRING, allowNull: true },
      birthDate:          { type: Sequelize.DATEONLY, allowNull: true },
      address:            { type: Sequelize.STRING, allowNull: true },
      onboardingComplete: { type: Sequelize.BOOLEAN, defaultValue: false },
      resetToken:         { type: Sequelize.STRING, allowNull: true },
      resetTokenExpires:  { type: Sequelize.DATE, allowNull: true },
      verifyToken:        { type: Sequelize.STRING, allowNull: true },
      verifyTokenExpires: { type: Sequelize.DATE, allowNull: true },
      createdAt:          { type: Sequelize.DATE, allowNull: false },
      updatedAt:          { type: Sequelize.DATE, allowNull: false }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Users');
  }
};
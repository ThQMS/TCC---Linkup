const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const User = db.define('User', {
    name:               { type: DataTypes.STRING, allowNull: false },
    email:              { type: DataTypes.STRING, allowNull: false, unique: true },
    password:           { type: DataTypes.STRING, allowNull: false },
    userType:           { type: DataTypes.STRING, allowNull: false, defaultValue: 'candidato' },
    isVerified:         { type: DataTypes.BOOLEAN, defaultValue: false },
    verificationCode:   { type: DataTypes.STRING, allowNull: true },
    verificationCodeExpires: { type: DataTypes.DATE, allowNull: true },
    isRecruiter:        { type: DataTypes.BOOLEAN, defaultValue: false },
    bio:                { type: DataTypes.TEXT, allowNull: true },
    city:               { type: DataTypes.STRING, allowNull: true },
    phone:              { type: DataTypes.STRING, allowNull: true },
    github:             { type: DataTypes.STRING, allowNull: true },
    linkedin:           { type: DataTypes.STRING, allowNull: true },
    website:            { type: DataTypes.STRING, allowNull: true },
    linkedinCompany:    { type: DataTypes.STRING, allowNull: true },
    sector:             { type: DataTypes.STRING, allowNull: true },
    companySize:        { type: DataTypes.STRING, allowNull: true },
    avatar:             { type: DataTypes.STRING, allowNull: true },
    birthDate:          { type: DataTypes.DATEONLY, allowNull: true },
    address:            { type: DataTypes.STRING, allowNull: true },
    onboardingComplete:  { type: DataTypes.BOOLEAN, defaultValue: false },
    checklistDismissed:  { type: DataTypes.BOOLEAN, defaultValue: false },
    openToWork:         { type: DataTypes.BOOLEAN, defaultValue: false },
    // Sistema de disponibilidade inteligente (4 status)
    // Valores: 'actively_searching' | 'open_to_opportunities' | 'in_selection_process' | 'not_available'
    availabilityStatus:    { type: DataTypes.STRING, allowNull: false, defaultValue: 'actively_searching' },
    availabilityUpdatedAt: { type: DataTypes.DATE,   allowNull: true },
    resetToken:         { type: DataTypes.STRING, allowNull: true },
    resetTokenExpires:  { type: DataTypes.DATE, allowNull: true },
    verifyToken:        { type: DataTypes.STRING, allowNull: true },
    verifyTokenExpires: { type: DataTypes.DATE, allowNull: true },
    cnpj:    { type: DataTypes.STRING,  allowNull: true },
    isPcd:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    pcdType: { type: DataTypes.STRING,  allowNull: true }
});

module.exports = User;
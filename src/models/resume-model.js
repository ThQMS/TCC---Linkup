const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const Resume = db.define('Resume', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },

  
  phone:     { type: DataTypes.STRING, allowNull: true },
  city:      { type: DataTypes.STRING, allowNull: true },
  birthDate: { type: DataTypes.STRING, allowNull: true },
  address:   { type: DataTypes.STRING, allowNull: true },
  linkedin:  { type: DataTypes.STRING, allowNull: true },
  github:    { type: DataTypes.STRING, allowNull: true },

  summary: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  experiences: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  },
  education: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  },
  skills: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  }
});

module.exports = Resume;
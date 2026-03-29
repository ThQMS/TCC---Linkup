const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const Application = db.define('Application', {
  jobId:           { type: DataTypes.INTEGER, allowNull: false },
  userId:          { type: DataTypes.INTEGER, allowNull: false },
  status:          { type: DataTypes.STRING,  defaultValue: 'pendente' },
  reminderSent:    { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: true },
  answers:         { type: DataTypes.TEXT,    defaultValue: '[]',  allowNull: true },
  answersScore:    { type: DataTypes.INTEGER,                       allowNull: true },
  answersFeedback: { type: DataTypes.TEXT,                          allowNull: true },
  currentStage:    { type: DataTypes.STRING,  allowNull: true,     defaultValue: null },
  stageHistory:    { type: DataTypes.TEXT,    allowNull: true,     defaultValue: '[]' },
});

module.exports = Application;
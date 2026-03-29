const { DataTypes } = require('sequelize');
const db = require('../config/connection');

// Registra cada chamada às features de IA
const AiLog = db.define('AiLog', {
    userId:      { type: DataTypes.INTEGER, allowNull: true },
    feature:     { type: DataTypes.STRING,  allowNull: false }, 
    durationMs:  { type: DataTypes.INTEGER, allowNull: true },  
    success:     { type: DataTypes.BOOLEAN, defaultValue: true }
});

module.exports = AiLog;
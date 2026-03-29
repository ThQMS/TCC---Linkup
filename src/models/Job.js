const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const Job = db.define('Job', {
    title:        { type: DataTypes.STRING, allowNull: false },
    description:  { type: DataTypes.TEXT,   allowNull: false },
    salary:       { type: DataTypes.STRING, allowNull: true },
    company:      { type: DataTypes.STRING, allowNull: false },
    email:        { type: DataTypes.STRING, allowNull: false },
    newJob:       { type: DataTypes.BOOLEAN, defaultValue: true },
    UserId:       { type: DataTypes.INTEGER, allowNull: true },
    modality:     { type: DataTypes.STRING, allowNull: true },
    requirements: { type: DataTypes.TEXT,   allowNull: true },
    benefits:     { type: DataTypes.TEXT,   allowNull: true },
    differential: { type: DataTypes.TEXT,   allowNull: true },
    questions:    { type: DataTypes.TEXT,   allowNull: true, defaultValue: '[]' },
    city:         { type: DataTypes.STRING, allowNull: true },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'aberta',
        validate: {
            isIn: [['aberta', 'pausada', 'encerrada', 'expirada']]
        }
    },
    views:           { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rediscoveryData: { type: DataTypes.TEXT,    allowNull: true,  defaultValue: null },
    stages:          { type: DataTypes.TEXT,    allowNull: true,  defaultValue: '[]' },
    contractType:    { type: DataTypes.STRING, allowNull: true },
    isPcd:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
    tableName: 'jobs'
});

module.exports = Job;
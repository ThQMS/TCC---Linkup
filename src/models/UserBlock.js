const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const UserBlock = db.define('UserBlock', {
    userId:    { type: DataTypes.INTEGER, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'user_blocks' });

module.exports = UserBlock;
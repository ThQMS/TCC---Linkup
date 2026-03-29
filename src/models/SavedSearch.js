const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const SavedSearch = db.define('SavedSearch', {
    userId:       { type: DataTypes.INTEGER, allowNull: false },
    query:        { type: DataTypes.STRING(500), allowNull: false },
    label:        { type: DataTypes.STRING(200) },
    alertEnabled: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'saved_searches' });

module.exports = SavedSearch;
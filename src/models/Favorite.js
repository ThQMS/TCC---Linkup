const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const Favorite = db.define('Favorite', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    jobId: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    tableName: 'favorites'
});

module.exports = Favorite;
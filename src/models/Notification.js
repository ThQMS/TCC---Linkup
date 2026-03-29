const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const Notification = db.define('Notification', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  message: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 'info' // info, success, danger
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  link: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = Notification;
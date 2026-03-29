const { DataTypes } = require('sequelize');
const db = require('../config/connection');

const JobView = db.define('JobView', {
  jobId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'job_views',

  indexes: [
    { unique: true, fields: ['jobId', 'userId'] }
  ]
});

module.exports = JobView;
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'linkup_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASS || null,
  {
    host:    process.env.DB_HOST || 'localhost',
    port:    parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle:    10000
    }
  }
);

async function connect() {
    const logger = require('../helpers/logger');
    await sequelize.authenticate();
    logger.info('db', 'Conectado ao banco com sucesso');
    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    logger.info('db', 'Modelos sincronizados');
}

module.exports = sequelize;
module.exports.connect = connect;
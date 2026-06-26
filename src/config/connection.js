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
    // Em produção o schema é gerido EXCLUSIVAMENTE por migrations (sequelize-cli).
    // sync({alter}) só roda em dev/teste — evita o app reescrever o schema em prod
    // e diverge das migrations (fonte única da verdade).
    if (process.env.NODE_ENV !== 'production') {
        await sequelize.sync({ alter: true });
        logger.info('db', 'Modelos sincronizados (dev)');
    } else {
        logger.info('db', 'Produção: schema gerido por migrations (sync desativado)');
    }
}

module.exports = sequelize;
module.exports.connect = connect;
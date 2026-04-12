require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || null,
    database: process.env.DB_NAME || 'linkup_db',
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    dialect:  'postgres',
    logging:  false
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    dialect:  'postgres',
    logging:  false,
    dialectOptions: {
      // DB_SSL_REJECT_UNAUTHORIZED=false apenas quando o provedor usa certificado self-signed
      // (ex: Railway interno). Em produção com TLS próprio, manter true (padrão).
      ssl: {
        require:             true,
        rejectUnauthorized:  process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      }
    }
  }
};
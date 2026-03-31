'use strict';

/*
 * Mock da conexão Sequelize para testes.
 * Substitui o PostgreSQL por SQLite em memória via moduleNameMapper.
 * Cada worker Jest recebe sua própria instância isolada (Jest isola módulos por worker).
 * sqlite3 deve estar instalado: npm install --save-dev sqlite3
 */
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging:  false // suprime SQL no output dos testes
});

module.exports = sequelize;

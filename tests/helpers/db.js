'use strict';

/*
 * db.js — Helpers de ciclo de vida do banco para testes.
 * Uso em cada test file:
 *   const { useDatabase } = require('../helpers/db');
 *   useDatabase();
 * Isso registra beforeAll/afterEach/afterAll automaticamente na suite corrente.
 */

const sequelize = require('../__mocks__/connection');
const models = require('../../src/models');
const DELETION_ORDER = [
  models.Notification,
  models.Application,
  models.Resume,
  models.Favorite,
  models.JobView,
  models.AiLog,
  models.SavedSearch,
  models.Job,
  models.User,
];


 
function useDatabase() {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterEach(async () => {
    // Limpa os dados entre testes sem recriar tabelas 
    for (const Model of DELETION_ORDER) {
      await Model.destroy({ where: {}, truncate: false });
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });
}

module.exports = { useDatabase, sequelize, models };

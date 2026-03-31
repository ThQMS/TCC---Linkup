'use strict';

/**
 * setup.js — Executado pelo Jest (setupFiles) ANTES de cada suite de testes.
 * Aqui só configuramos variáveis de ambiente.
 * Não há acesso a jest globals (beforeAll, jest.mock etc.) neste contexto.
 * A inicialização do banco (sync, truncate, close) fica em tests/helpers/db.js,
 * chamada explicitamente em cada test file.
 */

process.env.NODE_ENV   = 'test';
process.env.GMAIL_USER = 'noreply@linkup.test';
process.env.BASE_URL   = 'http://localhost:3000';

// Impede que a conexão PostgreSQL real seja tentada em caso de import acidental
process.env.DB_NAME = 'linkup_test';
process.env.DB_USER = 'test';
process.env.DB_PASS = 'test';
process.env.DB_HOST = 'localhost';

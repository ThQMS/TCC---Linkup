'use strict';

/**
 * Configuração Jest —
 * Decisões de arquitetura:
 * - rootDir aponta para a raiz do projeto (um nível acima de tests/)
 * - moduleNameMapper redireciona a conexão Sequelize para SQLite em memória
 * - setupFiles roda ANTES do framework Jest; usa-se apenas para variáveis de ambiente
 * - Cobertura coletada somente dos services (lógica de negócio crítica)
 */
module.exports = {
  testEnvironment: 'node',

  rootDir: '..',


  testMatch: ['<rootDir>/tests/**/*.test.js'],

 
  moduleNameMapper: {
    'config/connection': '<rootDir>/tests/__mocks__/connection.js'
  },


  setupFiles: ['<rootDir>/tests/setup.js'],

 
  collectCoverageFrom: [
    '<rootDir>/src/services/**/*.js'
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches:   60,
      functions:  70,
      lines:      70,
      statements: 70
    }
  },

  verbose: true,

  testPathIgnorePatterns: ['/node_modules/', '/migrations/'],

  
  transform: {}
};

'use strict';

/*
 * factories.js — Funções utilitárias para criação de dados de teste.
 * Todas as factories aceitam um objeto `overrides` para customizar campos
 * específicos sem precisar repetir os defaults em cada teste.
 */

const { User, Job, Application, Resume, Notification } = require('../../src/models');
let _counter = 0;
function uid() { return ++_counter; }

// ─── Factories 

/* Cria um candidato com status actively_searching por padrão. */
async function createCandidate(overrides = {}) {
  return User.create({
    name:               'Candidato Teste',
    email:              `candidato_${uid()}@test.com`,
    password:           'hashed_pass',
    userType:           'candidato',
    isVerified:         true,
    availabilityStatus: 'actively_searching',
    ...overrides
  });
}

/*Cria uma empresa.*/
async function createCompany(overrides = {}) {
  return User.create({
    name:               'Empresa Teste',
    email:              `empresa_${uid()}@test.com`,
    password:           'hashed_pass',
    userType:           'empresa',
    isVerified:         true,
    availabilityStatus: 'not_available',
    ...overrides
  });
}

/**
 * Cria uma vaga aberta vinculada a uma empresa.
 * @param {number} companyUserId
 */
async function createJob(companyUserId, overrides = {}) {
  return Job.create({
    title:        'Desenvolvedor Node.js',
    description:  'Vaga para desenvolvedor backend',
    company:      'Empresa Teste Ltda',
    email:        `vaga_${uid()}@empresa.com`,
    requirements: 'Node.js JavaScript PostgreSQL backend REST',
    status:       'aberta',
    UserId:       companyUserId,
    ...overrides
  });
}

/**
 * Cria um currículo com skills e experiências padronizados.
 * @param {number} userId
 */
async function createResume(userId, overrides = {}) {
  return Resume.create({
    userId,
    summary:     'Desenvolvedor experiente com foco em backend.',
    skills:      JSON.stringify(['Node.js', 'JavaScript', 'PostgreSQL', 'REST']),
    experiences: JSON.stringify([
      { role: 'Backend Developer', company: 'Old Tech', period: '2021-2023', description: 'APIs REST' }
    ]),
    education: JSON.stringify([
      { course: 'Ciência da Computação', institution: 'UFMG', period: '2017-2021' }
    ]),
    ...overrides
  });
}

/**
 * Cria uma candidatura pendente.
 */
async function createApplication(jobId, userId, overrides = {}) {
  return Application.create({
    jobId,
    userId,
    status:  'pendente',
    answers: '[]',
    ...overrides
  });
}

/**
 * Força o updatedAt de uma vaga para uma data no passado (para testar ghost jobs).
 *
 * @param {object} sequelize 
 * @param {number} jobId
 * @param {Date}   date
 */
async function setJobUpdatedAt(sequelize, jobId, date) {
  await sequelize.query(
    `UPDATE "${Job.getTableName()}" SET "updatedAt" = ? WHERE "id" = ?`,
    { replacements: [date.toISOString(), jobId] }
  );
}

module.exports = {
  createCandidate,
  createCompany,
  createJob,
  createResume,
  createApplication,
  setJobUpdatedAt
};

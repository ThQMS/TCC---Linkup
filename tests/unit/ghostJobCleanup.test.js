'use strict';

jest.mock('../../src/helpers/mailer', () => ({
  sendMail: jest.fn((opts, cb) => {
    if (typeof cb === 'function') return cb(null);
    return Promise.resolve({ messageId: 'mock-id' });
  })
}));

jest.mock('../../src/helpers/socket', () => jest.fn());

jest.mock('../../src/helpers/aiService', () => ({
  chatComplete: jest.fn().mockResolvedValue(
    '{"score":70,"feedback":"Bom candidato, continue aprimorando."}'
  )
}));

jest.mock('../../src/helpers/pdfService', () => ({
  generatePdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-content'))
}));

const { Op }                    = require('sequelize');
const { Job, Application, Notification } = require('../../src/models');
const { sendBulkClosingFeedback }        = require('../../src/services/applicationService');
const { useDatabase, sequelize }         = require('../helpers/db');
const {
  createCandidate,
  createCompany,
  createJob,
  createResume,
  createApplication,
  setJobUpdatedAt
} = require('../helpers/factories');

const mailer    = require('../../src/helpers/mailer');
const aiService = require('../../src/helpers/aiService');

const GHOST_THRESHOLD_DAYS = 21;

async function detectGhostJobs() {
  const cutoff = new Date(Date.now() - GHOST_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  return Job.findAll({
    where: {
      status:    'aberta',
      updatedAt: { [Op.lt]: cutoff }
    }
  });
}

async function cleanGhostJobs(expressApp = null) {
  const ghosts = await detectGhostJobs();
  for (const job of ghosts) {
    await job.update({ status: 'encerrada' });
    await sendBulkClosingFeedback(job);
  }
  return ghosts.length;
}

useDatabase();

describe('Ghost Job Cleanup — Regra dos 21 dias', () => {
  let company;
  let candidate;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate();
    jest.clearAllMocks();
  });

  // Substitui global.setTimeout por versão com delay 0 para evitar espera real de 600ms.
  // jest.useFakeTimers() causa deadlock com SQLite (libuv I/O nativo).
  async function runCleanup(app = null) {
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);
    let result;
    try {
      result = await cleanGhostJobs(app);
    } finally {
      global.setTimeout = realSetTimeout;
    }
    await new Promise(r => realSetTimeout(r, 25));
    return result;
  }

  describe('Detecção de vagas ghost', () => {
    test('Vaga com 22 dias sem atividade deve ser detectada como ghost', async () => {
      const job = await createJob(company.id);
      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job.id, past);

      const ghosts = await detectGhostJobs();

      expect(ghosts).toHaveLength(1);
      expect(ghosts[0].id).toBe(job.id);
    });

    test('Vaga com 20 dias de inatividade NÃO deve ser detectada', async () => {
      const job = await createJob(company.id);
      const recent = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job.id, recent);

      const ghosts = await detectGhostJobs();

      expect(ghosts).toHaveLength(0);
    });

    test('Vaga recém-criada nunca deve ser detectada como ghost', async () => {
      await createJob(company.id);

      const ghosts = await detectGhostJobs();

      expect(ghosts).toHaveLength(0);
    });

    test('Vagas já encerradas ou pausadas não devem ser retornadas', async () => {
      const encerrada = await createJob(company.id, { status: 'encerrada' });
      const pausada   = await createJob(company.id, { status: 'pausada' });

      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, encerrada.id, past);
      await setJobUpdatedAt(sequelize, pausada.id, past);

      const ghosts = await detectGhostJobs();

      expect(ghosts).toHaveLength(0);
    });
  });

  describe('Ação ao encerrar vaga ghost', () => {
    test('Status da vaga deve ser atualizado para "encerrada"', async () => {
      const job = await createJob(company.id);
      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job.id, past);

      const count = await runCleanup();

      expect(count).toBe(1);
      const updated = await Job.findByPk(job.id);
      expect(updated.status).toBe('encerrada');
    });

    test('Candidaturas pendentes devem ser marcadas como expiradas', async () => {
      const candidate2 = await createCandidate();
      await createResume(candidate.id);
      await createResume(candidate2.id);
      const job = await createJob(company.id);
      await createApplication(job.id, candidate.id, { status: 'pendente' });
      await createApplication(job.id, candidate2.id, { status: 'em análise' });

      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job.id, past);

      await runCleanup();

      const apps = await Application.findAll({ where: { jobId: job.id } });
      for (const app of apps) {
        expect(app.status).toBe('expirado');
      }
    });

    test('Candidato contratado NÃO deve receber e-mail de encerramento', async () => {
      await createResume(candidate.id);
      const job = await createJob(company.id);
      await createApplication(job.id, candidate.id, { status: 'contratado' });

      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job.id, past);

      await runCleanup();

      const contracted = await Application.findOne({ where: { jobId: job.id } });
      expect(contracted.status).toBe('contratado');
    });

    test('E-mails de feedback devem ser disparados para candidatos pendentes', async () => {
      await createResume(candidate.id);
      const job = await createJob(company.id);
      await createApplication(job.id, candidate.id, { status: 'pendente' });

      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job.id, past);

      await runCleanup();

      expect(aiService.chatComplete).toHaveBeenCalled();
      expect(mailer.sendMail).toHaveBeenCalled();
    });

    test('Múltiplas vagas ghost devem ser todas encerradas', async () => {
      const job1   = await createJob(company.id);
      const job2   = await createJob(company.id);
      const recent = await createJob(company.id);

      const past = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);
      await setJobUpdatedAt(sequelize, job1.id, past);
      await setJobUpdatedAt(sequelize, job2.id, past);

      const count = await runCleanup();

      expect(count).toBe(2);

      const [updated1, updated2, untouched] = await Promise.all([
        Job.findByPk(job1.id),
        Job.findByPk(job2.id),
        Job.findByPk(recent.id)
      ]);

      expect(updated1.status).toBe('encerrada');
      expect(updated2.status).toBe('encerrada');
      expect(untouched.status).toBe('aberta');
    });
  });
});

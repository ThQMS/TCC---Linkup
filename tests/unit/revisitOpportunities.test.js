'use strict';

jest.mock('../../src/helpers/mailer', () => ({
  sendMail: jest.fn((opts, cb) => {
    if (typeof cb === 'function') return cb(null);
    return Promise.resolve({ messageId: 'mock-id' });
  })
}));

jest.mock('../../src/helpers/socket', () => jest.fn());

const { Notification, Job, Application }    = require('../../src/models');
const { notifyRevisitedOpportunities }      = require('../../src/services/talentRediscoveryService');
const { useDatabase }                        = require('../helpers/db');
const {
  createCandidate,
  createCompany,
  createJob,
  createResume,
  createApplication
} = require('../helpers/factories');

const mailer     = require('../../src/helpers/mailer');
const sendSocket = require('../../src/helpers/socket');

const mockApp = { get: jest.fn().mockReturnValue(null) };

useDatabase();

describe('notifyRevisitedOpportunities — Oportunidades Revisitadas (candidato)', () => {
  let company;
  let candidate;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate({ availabilityStatus: 'actively_searching' });
    jest.clearAllMocks();
  });

  describe('Fluxo sem candidaturas anteriores', () => {
    test('Não deve notificar ninguém quando empresa não tem histórico de vagas', async () => {
      const novaVaga = await createJob(company.id);

      await expect(notifyRevisitedOpportunities(novaVaga, mockApp)).resolves.toBeUndefined();

      const notifications = await Notification.findAll({ where: { userId: candidate.id } });
      expect(notifications).toHaveLength(0);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('Com histórico de vagas mas sem candidatos aplicados → noop silencioso', async () => {
      await createJob(company.id);
      const novaVaga = await createJob(company.id);

      await expect(notifyRevisitedOpportunities(novaVaga, mockApp)).resolves.toBeUndefined();

      const notifications = await Notification.findAll({ where: { userId: candidate.id } });
      expect(notifications).toHaveLength(0);
    });
  });

  describe('Candidato disponível + fit adequado', () => {
    test('Deve criar notificação in-app quando fit >= 88%', async () => {
      await createResume(candidate.id, {
        skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
        experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
      });

      const vagaAntiga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });
      await createApplication(vagaAntiga.id, candidate.id);

      const novaVaga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });

      await notifyRevisitedOpportunities(novaVaga, mockApp);

      const notification = await Notification.findOne({ where: { userId: candidate.id } });
      expect(notification).not.toBeNull();
      expect(notification.type).toBe('info');
      expect(notification.message).toContain('%');
      expect(notification.link).toBe(`/jobs/view/${novaVaga.id}`);
    });

    test('Deve enviar e-mail quando fit >= 88%', async () => {
      await createResume(candidate.id, {
        skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
        experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
      });

      const vagaAntiga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });
      await createApplication(vagaAntiga.id, candidate.id);

      const novaVaga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });

      await notifyRevisitedOpportunities(novaVaga, mockApp);

      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const emailArgs = mailer.sendMail.mock.calls[0][0];
      expect(emailArgs.to).toBe(candidate.email);
      expect(emailArgs.subject).toContain('%');
    });
  });

  describe('Candidato não elegível', () => {
    test('Candidato com status not_available não deve ser notificado', async () => {
      const unavailable = await createCandidate({ availabilityStatus: 'not_available' });
      await createResume(unavailable.id, {
        skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
        experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
      });

      const vagaAntiga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });
      await createApplication(vagaAntiga.id, unavailable.id);

      const novaVaga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });

      await notifyRevisitedOpportunities(novaVaga, mockApp);

      const notification = await Notification.findOne({ where: { userId: unavailable.id } });
      expect(notification).toBeNull();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('Candidato com fit < 88% não deve ser notificado', async () => {
      await createResume(candidate.id, {
        skills:      JSON.stringify(['Python', 'Django', 'Scikit-learn']),
        experiences: '[]'
      });

      const vagaAntiga = await createJob(company.id, {
        title: 'Data Scientist', requirements: 'Python Django Scikit-learn'
      });
      await createApplication(vagaAntiga.id, candidate.id);

      const novaVaga = await createJob(company.id, {
        title:        'Engenheiro de Infraestrutura',
        requirements: 'Kubernetes Docker Terraform AWS Helm Prometheus'
      });

      await notifyRevisitedOpportunities(novaVaga, mockApp);

      const notification = await Notification.findOne({ where: { userId: candidate.id } });
      expect(notification).toBeNull();
    });
  });

  describe('Resiliência do fluxo', () => {
    test('Falha no envio de e-mail não deve lançar exceção', async () => {
      mailer.sendMail.mockRejectedValueOnce(new Error('SMTP timeout'));

      await createResume(candidate.id, {
        skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
        experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
      });

      const vagaAntiga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });
      await createApplication(vagaAntiga.id, candidate.id);

      const novaVaga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });

      await expect(notifyRevisitedOpportunities(novaVaga, mockApp)).resolves.toBeUndefined();
    });

    test('Candidato sem currículo não deve causar erro (fit retorna 0)', async () => {
      const vagaAntiga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });
      await createApplication(vagaAntiga.id, candidate.id);

      const novaVaga = await createJob(company.id, {
        title: 'backend developer', requirements: 'node javascript postgresql rest backend'
      });

      await expect(notifyRevisitedOpportunities(novaVaga, mockApp)).resolves.toBeUndefined();

      const notification = await Notification.findOne({ where: { userId: candidate.id } });
      expect(notification).toBeNull();
    });
  });
});

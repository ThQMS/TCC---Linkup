'use strict';

jest.mock('../../src/helpers/mailer', () => ({
  sendMail: jest.fn((opts, cb) => {
    if (typeof cb === 'function') return cb(null);
    return Promise.resolve({ messageId: 'mock-id' });
  })
}));

jest.mock('../../src/helpers/socket', () => jest.fn());

const { Job, Application, Notification } = require('../../src/models');
const {
  calcFitScore,
  findTalentsForJob,
  reactivateContact
} = require('../../src/services/talentRediscoveryService');
const { useDatabase } = require('../helpers/db');
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

describe('calcFitScore — Cálculo de fit por keyword matching', () => {
  test('Retorna 0 quando não há currículo', () => {
    const job = { title: 'Dev Node', requirements: 'Node.js', description: '' };
    expect(calcFitScore(null, job)).toBe(0);
  });

  test('Retorna 0 quando currículo não tem skills nem experiências', () => {
    const resume = { skills: '[]', experiences: '[]' };
    const job    = { title: 'Dev Node', requirements: 'Node.js JavaScript', description: '' };
    expect(calcFitScore(resume, job)).toBe(0);
  });

  test('Candidato com skills que correspondem exatamente aos requisitos retorna 100%', () => {
    const resume = { skills: JSON.stringify(['node', 'javascript']), experiences: '[]' };
    const job    = { title: 'Desenvolvedor', requirements: 'node javascript', description: '' };
    expect(calcFitScore(resume, job)).toBe(100);
  });

  test('Fit parcial retorna valor intermediário (não 0 e não 100)', () => {
    const resume = {
      skills:      JSON.stringify(['Node.js', 'JavaScript', 'Python', 'Django']),
      experiences: '[]'
    };
    const job = { title: 'Backend', requirements: 'Node.js JavaScript', description: 'REST APIs' };
    const score = calcFitScore(resume, job);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  test('Keywords de 2 caracteres ou menos são ignoradas (ruído)', () => {
    const resume = { skills: JSON.stringify(['js', 'go', 'c']), experiences: '[]' };
    const job    = { title: 'Dev', requirements: 'js go c', description: '' };
    expect(calcFitScore(resume, job)).toBe(0);
  });

  test('Experiências do candidato contribuem para o score (não só skills)', () => {
    const resume = {
      skills:      '[]',
      experiences: JSON.stringify([{ role: 'backend', company: 'Old Co' }])
    };
    const job = { title: 'backend developer', requirements: 'backend REST', description: '' };
    const score = calcFitScore(resume, job);
    expect(score).toBeGreaterThan(0);
  });
});

describe('findTalentsForJob — Redescoberta de talentos para empresa', () => {
  let company;
  let candidate;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate({ availabilityStatus: 'actively_searching' });
    jest.clearAllMocks();
  });

  test('Retorna vazio quando não há candidaturas anteriores', async () => {
    const job = await createJob(company.id);
    const result = await findTalentsForJob(job, company.id);
    expect(result).toEqual([]);
  });

  test('Candidato com fit abaixo de 88% é ignorado', async () => {
    await createResume(candidate.id, {
      skills:      JSON.stringify(['Python', 'Django', 'SQL']),
      experiences: '[]'
    });

    const oldJob = await createJob(company.id, {
      title:        'Engenheiro Backend',
      requirements: 'Node.js TypeScript React AWS Docker Kubernetes GraphQL Microservices'
    });
    await createApplication(oldJob.id, candidate.id);

    const newJob = await createJob(company.id, {
      title:        'Engenheiro Backend',
      requirements: 'Node.js TypeScript React AWS Docker Kubernetes GraphQL Microservices'
    });

    const result = await findTalentsForJob(newJob, company.id);
    expect(result).toEqual([]);
  });

  test('Candidato com fit >= 88% é incluído no resultado', async () => {
    await createResume(candidate.id, {
      skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
      experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
    });

    const oldJob = await createJob(company.id, {
      title:        'backend developer',
      requirements: 'node javascript postgresql rest backend'
    });
    await createApplication(oldJob.id, candidate.id);

    const newJob = await createJob(company.id, {
      title:        'backend developer',
      requirements: 'node javascript postgresql rest backend'
    });

    const result = await findTalentsForJob(newJob, company.id);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].fitScore).toBeGreaterThanOrEqual(88);
    expect(result[0].candidate.id).toBe(candidate.id);
  });

  test('Candidato com status not_available é excluído', async () => {
    const unavailable = await createCandidate({ availabilityStatus: 'not_available' });
    await createResume(unavailable.id, {
      skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
      experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
    });

    const oldJob = await createJob(company.id, {
      title: 'backend developer', requirements: 'node javascript postgresql rest backend'
    });
    await createApplication(oldJob.id, unavailable.id);

    const newJob = await createJob(company.id, {
      title: 'backend developer', requirements: 'node javascript postgresql rest backend'
    });

    const result = await findTalentsForJob(newJob, company.id);
    expect(result).toEqual([]);
  });

  test('Resultado é persistido em job.rediscoveryData', async () => {
    await createResume(candidate.id, {
      skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest']),
      experiences: JSON.stringify([{ role: 'backend', company: 'Old Corp' }])
    });

    const oldJob = await createJob(company.id, {
      title: 'backend developer', requirements: 'node javascript postgresql rest backend'
    });
    await createApplication(oldJob.id, candidate.id);

    const newJob = await createJob(company.id, {
      title: 'backend developer', requirements: 'node javascript postgresql rest backend'
    });

    await findTalentsForJob(newJob, company.id);

    const refreshed = await Job.findByPk(newJob.id);
    expect(refreshed.rediscoveryData).not.toBeNull();

    const stored = JSON.parse(refreshed.rediscoveryData);
    expect(Array.isArray(stored)).toBe(true);
  });

  test('Resultados são ordenados do maior para o menor fit', async () => {
    const c1 = await createCandidate({ availabilityStatus: 'actively_searching' });
    const c2 = await createCandidate({ availabilityStatus: 'actively_searching' });

    await createResume(c1.id, {
      skills:      JSON.stringify(['node', 'javascript', 'postgresql', 'rest', 'backend']),
      experiences: JSON.stringify([{ role: 'backend', company: 'X' }])
    });
    await createResume(c2.id, {
      skills:      JSON.stringify(['node', 'javascript']),
      experiences: '[]'
    });

    const oldJob = await createJob(company.id, {
      title: 'backend developer', requirements: 'node javascript postgresql rest backend'
    });
    await createApplication(oldJob.id, c1.id);
    await createApplication(oldJob.id, c2.id);

    const newJob = await createJob(company.id, {
      title: 'backend developer', requirements: 'node javascript postgresql rest backend'
    });

    const result = await findTalentsForJob(newJob, company.id);

    if (result.length >= 2) {
      expect(result[0].fitScore).toBeGreaterThanOrEqual(result[1].fitScore);
    }
  });
});

describe('reactivateContact — Botão "Reativar contato"', () => {
  let company;
  let candidate;
  let job;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate();
    job       = await createJob(company.id);
    jest.clearAllMocks();
  });

  test('Empresa que não é dona da vaga recebe erro de permissão', async () => {
    const anotherCompany = await createCompany();
    const result = await reactivateContact(job.id, candidate.id, anotherCompany.id, mockApp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/permissão/i);
  });

  test('Vaga inexistente retorna erro', async () => {
    const result = await reactivateContact(99999, candidate.id, company.id, mockApp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrada/i);
  });

  test('Candidato inexistente retorna erro', async () => {
    const result = await reactivateContact(job.id, 99999, company.id, mockApp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  test('Contato bem-sucedido cria notificação in-app para o candidato', async () => {
    const result = await reactivateContact(job.id, candidate.id, company.id, mockApp);
    expect(result.ok).toBe(true);

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).not.toBeNull();
    expect(notification.type).toBe('success');
    expect(notification.message).toContain(job.title);
  });

  test('Contato bem-sucedido dispara e-mail para o candidato', async () => {
    await reactivateContact(job.id, candidate.id, company.id, mockApp);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);

    const [callArgs] = mailer.sendMail.mock.calls;
    expect(callArgs[0].to).toBe(candidate.email);
    expect(callArgs[0].subject).toContain(job.company);
  });
});

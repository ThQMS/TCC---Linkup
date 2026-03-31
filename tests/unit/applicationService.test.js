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
    '{"score":75,"feedback":"Boa candidatura, continue se desenvolvendo."}'
  )
}));

jest.mock('../../src/helpers/pdfService', () => ({
  generatePdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-binary'))
}));

const { Application, Notification, Job } = require('../../src/models');
const {
  applyToJob,
  updateApplicationStatus,
  updateApplicationStage,
  sendBulkClosingFeedback
} = require('../../src/services/applicationService');
const { useDatabase }  = require('../helpers/db');
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

describe('applyToJob — Criação de candidatura', () => {
  let company;
  let candidate;
  let job;
  let resume;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate();
    job       = await createJob(company.id);
    resume    = await createResume(candidate.id);
    jest.clearAllMocks();
  });

  test('Cria Application no banco com status pendente', async () => {
    await applyToJob({ job, user: candidate, resume, answers: '[]', coverLetter: '' });

    const app = await Application.findOne({ where: { jobId: job.id, userId: candidate.id } });
    expect(app).not.toBeNull();
    expect(app.status).toBe('pendente');
    expect(app.jobId).toBe(job.id);
    expect(app.userId).toBe(candidate.id);
  });

  test('Cria Notification in-app para o dono da vaga', async () => {
    await applyToJob({ job, user: candidate, resume, answers: '[]', coverLetter: '' });

    const notification = await Notification.findOne({ where: { userId: company.id } });
    expect(notification).not.toBeNull();
    expect(notification.message).toContain(candidate.name);
    expect(notification.message).toContain(job.title);
    expect(notification.type).toBe('info');
    expect(notification.link).toBe(`/jobs/applications/${job.id}`);
  });

  test('Envia e-mail para o endereço da vaga (não da empresa)', async () => {
    await applyToJob({ job, user: candidate, resume, answers: '[]', coverLetter: '' });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const emailArgs = mailer.sendMail.mock.calls[0][0];
    expect(emailArgs.to).toBe(job.email);
    expect(emailArgs.subject).toContain(candidate.name);
    expect(emailArgs.subject).toContain(job.title);
  });

  test('E-mail inclui PDF do currículo em anexo quando gerado com sucesso', async () => {
    await applyToJob({ job, user: candidate, resume, answers: '[]', coverLetter: '' });

    const emailArgs = mailer.sendMail.mock.calls[0][0];
    expect(emailArgs.attachments).toHaveLength(1);
    expect(emailArgs.attachments[0].contentType).toBe('application/pdf');
  });

  test('Falha na geração de PDF não deve impedir a candidatura', async () => {
    const { generatePdf } = require('../../src/helpers/pdfService');
    generatePdf.mockRejectedValueOnce(new Error('PDF timeout'));

    await applyToJob({ job, user: candidate, resume, answers: '[]', coverLetter: '' });

    const app = await Application.findOne({ where: { jobId: job.id, userId: candidate.id } });
    expect(app).not.toBeNull();
    const emailArgs = mailer.sendMail.mock.calls[0][0];
    expect(emailArgs.attachments).toHaveLength(0);
  });

  test('Retorna { emailError: null } quando e-mail é enviado com sucesso', async () => {
    const result = await applyToJob({
      job, user: candidate, resume, answers: '[]', coverLetter: ''
    });
    expect(result.emailError).toBeNull();
  });

  test('Retorna { emailError: Error } quando e-mail falha', async () => {
    const smtpError = new Error('SMTP connection refused');
    mailer.sendMail.mockImplementationOnce((opts, cb) => cb(smtpError));

    const result = await applyToJob({
      job, user: candidate, resume, answers: '[]', coverLetter: ''
    });

    expect(result.emailError).toBe(smtpError);
    const app = await Application.findOne({ where: { jobId: job.id, userId: candidate.id } });
    expect(app).not.toBeNull();
  });
});

describe('updateApplicationStatus — Atualização de status', () => {
  let company;
  let candidate;
  let job;
  let application;

  beforeEach(async () => {
    company     = await createCompany();
    candidate   = await createCandidate();
    job         = await createJob(company.id);
    application = await createApplication(job.id, candidate.id);
    jest.clearAllMocks();
  });

  test('Status é atualizado no banco', async () => {
    await updateApplicationStatus({ application, job, status: 'aprovado', expressApp: mockApp });

    const updated = await Application.findByPk(application.id);
    expect(updated.status).toBe('aprovado');
  });

  test('Aprovação cria notificação de sucesso para o candidato', async () => {
    await updateApplicationStatus({ application, job, status: 'aprovado', expressApp: mockApp });

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).not.toBeNull();
    expect(notification.type).toBe('success');
    expect(notification.message).toContain(job.title);
    expect(notification.message).toContain('aprovada');
  });

  test('Rejeição cria notificação de danger para o candidato', async () => {
    await updateApplicationStatus({ application, job, status: 'rejeitado', expressApp: mockApp });

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).not.toBeNull();
    expect(notification.type).toBe('danger');
  });

  test('Contratação cria notificação de parabéns', async () => {
    await updateApplicationStatus({ application, job, status: 'contratado', expressApp: mockApp });

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).not.toBeNull();
    expect(notification.type).toBe('success');
    expect(notification.message).toMatch(/parabéns|contratado/i);
  });

  test('sendSocketNotification é chamado em qualquer mudança de status', async () => {
    await updateApplicationStatus({ application, job, status: 'aprovado', expressApp: mockApp });
    expect(sendSocket).toHaveBeenCalledWith(
      mockApp,
      candidate.id,
      expect.objectContaining({ title: 'Status atualizado' })
    );
  });

  test('Status "em análise" NÃO cria notificação para candidato', async () => {
    await updateApplicationStatus({ application, job, status: 'em análise', expressApp: mockApp });

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).toBeNull();
  });

  test('Rejeição dispara feedback via IA (fire-and-forget)', async () => {
    const start = Date.now();
    await updateApplicationStatus({ application, job, status: 'rejeitado', expressApp: mockApp });
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

describe('updateApplicationStage — Avanço de etapa', () => {
  let company;
  let candidate;
  let job;
  let application;

  beforeEach(async () => {
    company     = await createCompany();
    candidate   = await createCandidate();
    job         = await createJob(company.id);
    application = await createApplication(job.id, candidate.id);
    jest.clearAllMocks();
  });

  test('currentStage é atualizado no banco', async () => {
    await updateApplicationStage({
      application,
      stageName: 'Teste Técnico',
      expressApp: mockApp
    });

    const updated = await Application.findByPk(application.id);
    expect(updated.currentStage).toBe('Teste Técnico');
  });

  test('Histórico de etapas é acumulado corretamente', async () => {
    await updateApplicationStage({ application, stageName: 'Triagem', expressApp: mockApp });

    const afterFirst = await Application.findByPk(application.id);
    await updateApplicationStage({
      application: afterFirst,
      stageName: 'Entrevista RH',
      expressApp: mockApp
    });

    const final   = await Application.findByPk(application.id);
    const history = JSON.parse(final.stageHistory);

    expect(history).toHaveLength(2);
    expect(history[0].stage).toBe('Triagem');
    expect(history[1].stage).toBe('Entrevista RH');
    expect(history[0]).toHaveProperty('movedAt');
  });

  test('Cria notificação de avanço de etapa para o candidato', async () => {
    await updateApplicationStage({
      application,
      stageName: 'Entrevista Final',
      expressApp: mockApp
    });

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).not.toBeNull();
    expect(notification.message).toContain('Entrevista Final');
    expect(notification.type).toBe('info');
  });

  test('Socket é emitido quando expressApp está disponível', async () => {
    await updateApplicationStage({
      application,
      stageName: 'Proposta',
      expressApp: mockApp
    });

    expect(sendSocket).toHaveBeenCalledWith(
      mockApp,
      candidate.id,
      expect.objectContaining({ title: 'Nova etapa!' })
    );
  });
});

describe('sendBulkClosingFeedback — Encerramento em lote', () => {
  let company;
  let candidate;
  let job;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate();
    job       = await createJob(company.id);
    jest.clearAllMocks();
  });

  // Substitui global.setTimeout por versão com delay 0 para evitar espera real de 600ms.
  // jest.useFakeTimers() causa deadlock com SQLite (libuv I/O nativo).
  async function runBulkFeedback(jobArg) {
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);
    try {
      await sendBulkClosingFeedback(jobArg);
    } finally {
      global.setTimeout = realSetTimeout;
    }
    await new Promise(r => realSetTimeout(r, 25));
  }

  test('Candidaturas pendentes são marcadas como expirado', async () => {
    await createResume(candidate.id);
    const app = await createApplication(job.id, candidate.id, { status: 'pendente' });

    await runBulkFeedback(job);

    const updated = await Application.findByPk(app.id);
    expect(updated.status).toBe('expirado');
  });

  test('Candidaturas "em análise" também são encerradas', async () => {
    await createResume(candidate.id);
    const app = await createApplication(job.id, candidate.id, { status: 'em análise' });

    await runBulkFeedback(job);

    const updated = await Application.findByPk(app.id);
    expect(updated.status).toBe('expirado');
  });

  test('Candidaturas contratadas NÃO são alteradas', async () => {
    const hired = await createApplication(job.id, candidate.id, { status: 'contratado' });

    await runBulkFeedback(job);

    const updated = await Application.findByPk(hired.id);
    expect(updated.status).toBe('contratado');
  });

  test('Candidaturas já expiradas NÃO são duplicadas', async () => {
    const expired = await createApplication(job.id, candidate.id, { status: 'expirado' });

    await runBulkFeedback(job);

    const updated = await Application.findByPk(expired.id);
    expect(updated.status).toBe('expirado');
  });

  test('Executa sem erros quando não há candidaturas', async () => {
    await expect(sendBulkClosingFeedback(job)).resolves.toBeUndefined();
  });
});

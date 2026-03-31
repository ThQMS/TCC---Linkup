'use strict';

/**
 * jobs.routes.test.js
 * Teste de integração da rota POST /jobs/apply/:id
 * Exercita a stack completa (route → middleware → controller → service → DB)
 * com banco SQLite em memória e helpers externos mockados.
 * O Express app é montado de forma mínima, sem importar app.js (que inicializa
 * cron jobs). Apenas o que o controlador precisa é configurado.
 */

// ─── Mocks — antes de qualquer require de módulo alvo ─────────────────────────

jest.mock('../../src/helpers/mailer', () => ({
  sendMail: jest.fn((opts, cb) => {
    if (typeof cb === 'function') return cb(null);
    return Promise.resolve({ messageId: 'mock-id' });
  })
}));

jest.mock('../../src/helpers/socket', () => jest.fn());

jest.mock('../../src/helpers/aiService', () => ({
  chatComplete: jest.fn().mockResolvedValue('{"score":80,"feedback":"Ótimo candidato."}')
}));

jest.mock('../../src/helpers/pdfService', () => ({
  generatePdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf'))
}));

// O logger pode escrever livremente; não precisa ser mockado
// (evita acesso à rede — nenhum helper de log depende de I/O externo)

// ─── Imports 

const express      = require('express');
const session      = require('express-session');
const flash        = require('connect-flash');
const bodyParser   = require('body-parser');
const supertest    = require('supertest');

const jobsRouter   = require('../../src/routes/jobs');
const { Application, Notification } = require('../../src/models');
const { useDatabase }               = require('../helpers/db');
const {
  createCandidate,
  createCompany,
  createJob,
  createResume,
  createApplication
} = require('../helpers/factories');
const mailer = require('../../src/helpers/mailer');

// ─── Fábrica do app de teste 

/**
 * Cria um Express app mínimo sem cron jobs, sem Handlebars, sem CSRF.
 *
 * @param {object} authenticatedUser - Objeto req.user a ser injetado
 */
function buildTestApp(authenticatedUser = null) {
  const app = express();

  // Body parsing
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());


  app.use(session({
    secret:            'test-secret',
    resave:            false,
    saveUninitialized: false
  }));

  // Flash messages
  app.use(flash());

  // Expõe flash como res.locals (pattern do projeto real)
  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg   = req.flash('error_msg');
    next();
  });

  // Injeta usuário autenticado (substitui Passport.js)
  app.use((req, res, next) => {
    req.isAuthenticated = () => !!authenticatedUser;
    req.user            = authenticatedUser;
    next();
  });

  // Monta apenas o router de jobs (sem iniciar cron jobs)
  app.use('/jobs', jobsRouter);

  app.use((req, res) => res.status(404).send('Not found'));

  return app;
}

// ─── Suite

useDatabase();

describe('POST /jobs/apply/:id — Integração', () => {
  let company;
  let candidate;
  let job;
  let resume;
  let agent; 

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate();
    job       = await createJob(company.id);
    resume    = await createResume(candidate.id);
    jest.clearAllMocks();

    // Cria agent para preservar cookies de sessão entre requisições
    const app = buildTestApp(candidate);
    agent = supertest.agent(app);
  });

  describe('Candidatura bem-sucedida', () => {
    test('Retorna redirect 302 para a página da vaga', async () => {
      const res = await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]', coverLetter: '' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/jobs/view/${job.id}`);
    });

    test('Application é criada no banco com status pendente', async () => {
      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]', coverLetter: '' });

      const application = await Application.findOne({
        where: { jobId: job.id, userId: candidate.id }
      });

      expect(application).not.toBeNull();
      expect(application.status).toBe('pendente');
    });

    test('Notificação é criada para o dono da vaga', async () => {
      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]', coverLetter: '' });

      const notification = await Notification.findOne({ where: { userId: company.id } });
      expect(notification).not.toBeNull();
      expect(notification.message).toContain(candidate.name);
    });

    test('E-mail é enviado para o endereço da vaga', async () => {
      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]', coverLetter: '' });

      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const callArgs = mailer.sendMail.mock.calls[0][0];
      expect(callArgs.to).toBe(job.email);
    });
  });

  describe('Candidatura bloqueada — sem currículo', () => {
    test('Candidato sem currículo é redirecionado com erro', async () => {
      // Remove o currículo criado no beforeEach
      await resume.destroy();

      const res = await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

  
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`/jobs/view/${job.id}`);
    });

    test('Application NÃO é criada quando candidato não tem currículo', async () => {
      await resume.destroy();

      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      const application = await Application.findOne({
        where: { jobId: job.id, userId: candidate.id }
      });
      expect(application).toBeNull();
    });

    test('E-mail NÃO é enviado quando candidatura é bloqueada por falta de currículo', async () => {
      await resume.destroy();

      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });


  describe('Candidatura bloqueada — candidatura duplicada', () => {
    test('Segunda candidatura redireciona com erro', async () => {
      await createApplication(job.id, candidate.id);

      const res = await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/jobs/view/${job.id}`);
    });

    test('NÃO cria segunda Application no banco', async () => {
      await createApplication(job.id, candidate.id);

      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      const count = await Application.count({
        where: { jobId: job.id, userId: candidate.id }
      });
      expect(count).toBe(1); 
    });
  });

  describe('Candidatura bloqueada — vaga encerrada', () => {
    test('Vaga encerrada bloqueia candidatura e redireciona com erro', async () => {
      await job.update({ status: 'encerrada' });

      const res = await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`/jobs/view/${job.id}`);
    });

    test('Application NÃO é criada para vaga encerrada', async () => {
      await job.update({ status: 'encerrada' });

      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      const application = await Application.findOne({
        where: { jobId: job.id, userId: candidate.id }
      });
      expect(application).toBeNull();
    });
  });

  
  describe('Candidatura bloqueada — usuário do tipo empresa', () => {
    test('Empresa não pode se candidatar e é redirecionada com erro', async () => {
  
      const app   = buildTestApp(company);
      const agent = supertest.agent(app);

      const res = await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`/jobs/view/${job.id}`);
    });

    test('Application NÃO é criada quando o requester é empresa', async () => {
      const app   = buildTestApp(company);
      const agent = supertest.agent(app);

      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      const application = await Application.findOne({
        where: { jobId: job.id, userId: company.id }
      });
      expect(application).toBeNull();
    });
  });

  describe('Resiliência — falha no envio de e-mail', () => {
    test('Falha no e-mail NÃO impede criação da candidatura', async () => {
    
      mailer.sendMail.mockImplementationOnce((opts, cb) => cb(new Error('SMTP down')));

      await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      // Candidatura deve existir mesmo com erro no e-mail
      const application = await Application.findOne({
        where: { jobId: job.id, userId: candidate.id }
      });
      expect(application).not.toBeNull();
    });

    test('Redireciona normalmente mesmo com falha de e-mail', async () => {
      mailer.sendMail.mockImplementationOnce((opts, cb) => cb(new Error('SMTP down')));

      const res = await agent
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      // Controller não lança erro — apenas loga e flasha mensagem diferente
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/jobs/view/${job.id}`);
    });
  });


  describe('Usuário não autenticado', () => {
    test('Sem usuário autenticado, rota protegida redireciona para login', async () => {
      const app    = buildTestApp(null); 
      const agent2 = supertest.agent(app);

      const res = await agent2
        .post(`/jobs/apply/${job.id}`)
        .type('form')
        .send({ answers: '[]' });

      // ensureAuthenticated redireciona para /login
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });
  });
});

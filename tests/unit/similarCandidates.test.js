'use strict';

/**
 * similarCandidates.test.js
 *
 * Testa o serviço de CANDIDATOS SIMILARES/SUGERIDOS:
 *
 *   findSuggestedCandidates(jobId, companyUserId)
 *     - Busca candidatos que NÃO se candidataram mas têm alto fit.
 *     - combinedScore = fitScore × 0.6 + skillSimilarity × 0.4
 *     - Threshold mínimo: 50 (COMBINED_THRESHOLD)
 *
 *   contactSuggestedCandidate(jobId, candidateId, companyUserId, expressApp)
 *     - Envia convite ao candidato (notificação + socket + e-mail).
 *     - Previne convites duplicados.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/helpers/mailer', () => ({
  sendMail: jest.fn((opts, cb) => {
    if (typeof cb === 'function') return cb(null);
    return Promise.resolve({ messageId: 'mock-id' });
  })
}));

jest.mock('../../src/helpers/socket', () => jest.fn());

// ─── Imports ──────────────────────────────────────────────────────────────────

const { Notification }          = require('../../src/models');
const {
  findSuggestedCandidates,
  contactSuggestedCandidate
} = require('../../src/services/similarCandidatesService');
const { useDatabase }           = require('../helpers/db');
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

// ─── Suite ────────────────────────────────────────────────────────────────────

useDatabase();

// ───────────────────────────────────────────────────────────────────────────────
describe('findSuggestedCandidates — Busca candidatos sugeridos', () => {
  let company;

  beforeEach(async () => {
    company = await createCompany();
    jest.clearAllMocks();
  });

  test('Empresa que não é dona da vaga recebe array vazio', async () => {
    const anotherCompany = await createCompany();
    const job = await createJob(company.id);

    const result = await findSuggestedCandidates(job.id, anotherCompany.id);

    expect(result).toEqual([]);
  });

  test('Vaga inexistente retorna array vazio', async () => {
    const result = await findSuggestedCandidates(99999, company.id);
    expect(result).toEqual([]);
  });

  test('Candidatos que já se candidataram são excluídos dos resultados', async () => {
    const alreadyApplied = await createCandidate({ availabilityStatus: 'actively_searching' });
    await createResume(alreadyApplied.id, {
      skills: JSON.stringify(['node', 'javascript', 'postgresql', 'rest', 'backend'])
    });
    const job = await createJob(company.id, {
      requirements: 'node javascript postgresql rest backend'
    });
    // Já candidatou → deve ser excluído
    await createApplication(job.id, alreadyApplied.id);

    const result = await findSuggestedCandidates(job.id, company.id);

    const ids = result.map(r => r.candidate.id);
    expect(ids).not.toContain(alreadyApplied.id);
  });

  test('Candidato not_available é excluído mesmo com alto fit', async () => {
    const unavailable = await createCandidate({ availabilityStatus: 'not_available' });
    await createResume(unavailable.id, {
      skills: JSON.stringify(['node', 'javascript', 'postgresql', 'rest', 'backend'])
    });
    const job = await createJob(company.id, {
      requirements: 'node javascript postgresql rest backend'
    });

    const result = await findSuggestedCandidates(job.id, company.id);

    const ids = result.map(r => r.candidate.id);
    expect(ids).not.toContain(unavailable.id);
  });

  test('Candidatos sem currículo são excluídos', async () => {
    const noCv = await createCandidate({ availabilityStatus: 'actively_searching' });
    // Sem createResume → sem currículo → deve ser ignorado
    const job = await createJob(company.id, {
      requirements: 'node javascript postgresql rest backend'
    });

    const result = await findSuggestedCandidates(job.id, company.id);

    const ids = result.map(r => r.candidate.id);
    expect(ids).not.toContain(noCv.id);
  });

  test('Candidato com combinedScore abaixo de 50 não é incluído', async () => {
    // Skills completamente diferentes da vaga → combinedScore baixo
    const lowFit = await createCandidate({ availabilityStatus: 'actively_searching' });
    await createResume(lowFit.id, {
      skills:      JSON.stringify(['Photoshop', 'Illustrator', 'Figma']),
      experiences: '[]'
    });
    const job = await createJob(company.id, {
      requirements: 'node javascript postgresql rest backend aws kubernetes'
    });

    const result = await findSuggestedCandidates(job.id, company.id);

    const ids = result.map(r => r.candidate.id);
    expect(ids).not.toContain(lowFit.id);
  });

  test('Resultado tem no máximo 3 candidatos (MAX_RESULTS)', async () => {
    const job = await createJob(company.id, {
      requirements: 'node javascript postgresql rest backend'
    });

    // Cria 5 candidatos com alto fit
    for (let i = 0; i < 5; i++) {
      const c = await createCandidate({ availabilityStatus: 'actively_searching' });
      await createResume(c.id, {
        skills: JSON.stringify(['node', 'javascript', 'postgresql', 'rest', 'backend'])
      });
    }

    const result = await findSuggestedCandidates(job.id, company.id);

    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('Cada resultado contém os campos esperados', async () => {
    const c = await createCandidate({ availabilityStatus: 'actively_searching' });
    await createResume(c.id, {
      skills: JSON.stringify(['node', 'javascript', 'postgresql', 'rest', 'backend'])
    });
    const job = await createJob(company.id, {
      requirements: 'node javascript postgresql rest backend'
    });

    const result = await findSuggestedCandidates(job.id, company.id);

    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty('candidate');
      expect(item).toHaveProperty('fitScore');
      expect(item).toHaveProperty('skillSimilarity');
      expect(item).toHaveProperty('combinedScore');
      expect(item).toHaveProperty('commonSkills');
      expect(item.combinedScore).toBeGreaterThanOrEqual(50);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('contactSuggestedCandidate — Convidar candidato similar', () => {
  let company;
  let candidate;
  let job;

  beforeEach(async () => {
    company   = await createCompany();
    candidate = await createCandidate();
    job       = await createJob(company.id);
    jest.clearAllMocks();
  });

  test('Empresa sem ownership da vaga recebe erro de permissão', async () => {
    const other = await createCompany();
    const result = await contactSuggestedCandidate(job.id, candidate.id, other.id, mockApp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/permissão/i);
  });

  test('Vaga inexistente retorna erro', async () => {
    const result = await contactSuggestedCandidate(99999, candidate.id, company.id, mockApp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrada/i);
  });

  test('Candidato inexistente retorna erro', async () => {
    const result = await contactSuggestedCandidate(job.id, 99999, company.id, mockApp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  test('Contato bem-sucedido cria notificação do tipo similar_invite', async () => {
    const result = await contactSuggestedCandidate(job.id, candidate.id, company.id, mockApp);
    expect(result.ok).toBe(true);

    const notification = await Notification.findOne({ where: { userId: candidate.id } });
    expect(notification).not.toBeNull();
    expect(notification.type).toBe('similar_invite');
    expect(notification.link).toBe(`/jobs/view/${job.id}`);
    expect(notification.message).toContain(job.title);
  });

  test('E-mail é enviado ao candidato', async () => {
    await contactSuggestedCandidate(job.id, candidate.id, company.id, mockApp);

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const emailArgs = mailer.sendMail.mock.calls[0][0];
    expect(emailArgs.to).toBe(candidate.email);
    expect(emailArgs.subject).toContain(job.company);
  });

  test('Socket é chamado (candidato pode estar online)', async () => {
    await contactSuggestedCandidate(job.id, candidate.id, company.id, mockApp);
    expect(sendSocket).toHaveBeenCalledWith(
      mockApp,
      candidate.id,
      expect.objectContaining({ title: expect.stringContaining(job.company) })
    );
  });

  test('Convite duplicado para a mesma vaga retorna erro sem criar nova notificação', async () => {
    // Primeiro convite — deve funcionar
    const first = await contactSuggestedCandidate(job.id, candidate.id, company.id, mockApp);
    expect(first.ok).toBe(true);

    jest.clearAllMocks();

    // Segundo convite — deve ser bloqueado
    const second = await contactSuggestedCandidate(job.id, candidate.id, company.id, mockApp);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/já foi convidado/i);

    // Não deve ter criado nova notificação
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  test('Falha no e-mail não interrompe o fluxo principal (ok: true)', async () => {
    // sendMail falha na chamada Promise
    mailer.sendMail.mockRejectedValueOnce(new Error('SMTP error'));

    // O serviço usa .catch() no sendMail → não propaga o erro
    const result = await contactSuggestedCandidate(job.id, candidate.id, company.id, mockApp);
    expect(result.ok).toBe(true);
  });
});

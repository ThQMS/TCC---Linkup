'use strict';

jest.mock('../../src/helpers/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/helpers/socket', () => jest.fn());

jest.mock('../../src/helpers/mailer', () => ({
  sendMail: jest.fn((opts, cb) => {
    if (typeof cb === 'function') return cb(null);
    return Promise.resolve({ messageId: 'mock-id' });
  }),
}));

const { User, Application, Notification } = require('../../src/models');
const {
  STATUS,
  AVAILABLE_STATUSES,
  isAvailable,
  setAvailability,
  checkAndUpdateAvailability,
  getAvailableCandidateIds,
} = require('../../src/services/availabilityService');
const { useDatabase, sequelize } = require('../helpers/db');
const { createCandidate, createApplication } = require('../helpers/factories');

useDatabase();

// ─── Helpers locais ────────────────────────────────────────────────────────────

/** Força o updatedAt de um usuário para N dias atrás (simula inatividade). */
async function setUserUpdatedAt(userId, daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  await sequelize.query(
    `UPDATE "Users" SET "updatedAt" = ? WHERE "id" = ?`,
    { replacements: [date.toISOString(), userId] }
  );
}

/** Força o updatedAt de uma candidatura para N dias atrás. */
async function setApplicationUpdatedAt(appId, daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  await sequelize.query(
    `UPDATE "Applications" SET "createdAt" = ?, "updatedAt" = ? WHERE "id" = ?`,
    { replacements: [date.toISOString(), date.toISOString(), appId] }
  );
}

// ─── Suite 1: isAvailable ──────────────────────────────────────────────────────

describe('isAvailable — Filtragem de candidatos para empresas', () => {
  test('actively_searching → disponível', () => {
    expect(isAvailable({ availabilityStatus: STATUS.ACTIVELY_SEARCHING })).toBe(true);
  });

  test('open_to_opportunities → disponível', () => {
    expect(isAvailable({ availabilityStatus: STATUS.OPEN_TO_OPPORTUNITIES })).toBe(true);
  });

  test('in_selection_process → disponível (ainda contactável)', () => {
    expect(isAvailable({ availabilityStatus: STATUS.IN_SELECTION_PROCESS })).toBe(true);
  });

  test('not_available → não disponível (deve ser excluído das buscas)', () => {
    expect(isAvailable({ availabilityStatus: STATUS.NOT_AVAILABLE })).toBe(false);
  });

  test('AVAILABLE_STATUSES contém exatamente 3 status', () => {
    expect(AVAILABLE_STATUSES).toHaveLength(3);
    expect(AVAILABLE_STATUSES).not.toContain(STATUS.NOT_AVAILABLE);
  });
});

// ─── Suite 2: setAvailability ──────────────────────────────────────────────────

describe('setAvailability — Atualização de status do candidato', () => {
  test('Atualiza para actively_searching e sincroniza openToWork=true', async () => {
    const user = await createCandidate({ availabilityStatus: 'not_available', openToWork: false });
    await setAvailability(user.id, STATUS.ACTIVELY_SEARCHING);

    const updated = await User.findByPk(user.id);
    expect(updated.availabilityStatus).toBe(STATUS.ACTIVELY_SEARCHING);
    expect(updated.openToWork).toBe(true);
    expect(updated.availabilityUpdatedAt).not.toBeNull();
  });

  test('Atualiza para not_available e sincroniza openToWork=false', async () => {
    const user = await createCandidate({ availabilityStatus: 'actively_searching', openToWork: true });
    await setAvailability(user.id, STATUS.NOT_AVAILABLE);

    const updated = await User.findByPk(user.id);
    expect(updated.availabilityStatus).toBe(STATUS.NOT_AVAILABLE);
    expect(updated.openToWork).toBe(false);
  });

  test('Todos os status disponíveis sincronizam openToWork=true', async () => {
    for (const status of AVAILABLE_STATUSES) {
      const user = await createCandidate({ availabilityStatus: 'not_available', openToWork: false });
      await setAvailability(user.id, status);
      const updated = await User.findByPk(user.id);
      expect(updated.openToWork).toBe(true);
    }
  });

  test('Status inválido lança erro e não altera o banco', async () => {
    const user = await createCandidate({ availabilityStatus: 'actively_searching' });
    await expect(setAvailability(user.id, 'status_invalido')).rejects.toThrow('Status inválido: status_invalido');

    const unchanged = await User.findByPk(user.id);
    expect(unchanged.availabilityStatus).toBe('actively_searching');
  });
});

// ─── Suite 3: checkAndUpdateAvailability ──────────────────────────────────────

describe('checkAndUpdateAvailability — Regras automáticas de disponibilidade', () => {
  test('Usuário não encontrado retorna changed=false', async () => {
    const result = await checkAndUpdateAvailability(999999);
    expect(result).toEqual({ changed: false, reason: null });
  });

  test('Empresa não sofre alteração de status', async () => {
    const empresa = await User.create({
      name: 'Empresa', email: `empresa_chk@test.com`, password: 'x',
      userType: 'empresa', isVerified: true, availabilityStatus: 'not_available',
    });
    const result = await checkAndUpdateAvailability(empresa.id);
    expect(result).toEqual({ changed: false, reason: null });
  });

  test('Regra 1: aprovado em candidatura → envia notificação, não muda status automaticamente', async () => {
    const user = await createCandidate({ availabilityStatus: 'actively_searching' });
    await createApplication(
      (await require('../../src/models').Job.create({
        title: 'Dev', description: 'x', company: 'Co', email: `j_${Date.now()}@co.com`,
        requirements: 'x', status: 'aberta', UserId: user.id,
      })).id,
      user.id,
      { status: 'aprovado' }
    );

    const result = await checkAndUpdateAvailability(user.id);

    // Status NÃO deve mudar automaticamente
    const unchanged = await User.findByPk(user.id);
    expect(unchanged.availabilityStatus).toBe('actively_searching');
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/notificação/i);

    // Deve ter criado uma notificação de sugestão
    const notif = await Notification.findOne({ where: { userId: user.id } });
    expect(notif).not.toBeNull();
    expect(notif.message).toMatch(/não disponível/i);
  });

  test('Regra 2: inativo há 60+ dias e actively_searching → downgrade para open_to_opportunities', async () => {
    const user = await createCandidate({ availabilityStatus: 'actively_searching' });

    // Simula 61 dias de inatividade total
    await setUserUpdatedAt(user.id, 61);

    const result = await checkAndUpdateAvailability(user.id);

    const updated = await User.findByPk(user.id);
    expect(updated.availabilityStatus).toBe(STATUS.OPEN_TO_OPPORTUNITIES);
    expect(result.changed).toBe(true);
    expect(result.reason).toMatch(/inatividade/i);
  });

  test('Regra 2: inativo mas já em open_to_opportunities → não muda (evita downgrade duplo)', async () => {
    const user = await createCandidate({ availabilityStatus: 'open_to_opportunities' });
    await setUserUpdatedAt(user.id, 61);

    const result = await checkAndUpdateAvailability(user.id);

    const unchanged = await User.findByPk(user.id);
    expect(unchanged.availabilityStatus).toBe('open_to_opportunities');
    expect(result.changed).toBe(false);
  });

  test('Candidatura recente protege contra downgrade por inatividade', async () => {
    const user = await createCandidate({ availabilityStatus: 'actively_searching' });

    // Usuário inativo no login (61 dias) mas com candidatura recente (5 dias)
    await setUserUpdatedAt(user.id, 61);
    const empresa = await User.create({
      name: 'Co', email: `co_${Date.now()}@co.com`, password: 'x',
      userType: 'empresa', isVerified: true, availabilityStatus: 'not_available',
    });
    const job = await require('../../src/models').Job.create({
      title: 'Dev', description: 'x', company: 'Co', email: `j2_${Date.now()}@co.com`,
      requirements: 'x', status: 'aberta', UserId: empresa.id,
    });
    const app = await createApplication(job.id, user.id);
    // candidatura criada há 5 dias (dentro da janela de 30 dias)
    await setApplicationUpdatedAt(app.id, 5);

    const result = await checkAndUpdateAvailability(user.id);

    const unchanged = await User.findByPk(user.id);
    expect(unchanged.availabilityStatus).toBe('actively_searching');
    expect(result.changed).toBe(false);
  });
});

// ─── Suite 4: getAvailableCandidateIds ────────────────────────────────────────

describe('getAvailableCandidateIds — Pool de candidatos para buscas batch', () => {
  test('Retorna apenas candidatos verificados com status disponível', async () => {
    const ativo    = await createCandidate({ availabilityStatus: 'actively_searching' });
    const aberto   = await createCandidate({ availabilityStatus: 'open_to_opportunities' });
    const processo = await createCandidate({ availabilityStatus: 'in_selection_process' });
    const inativo  = await createCandidate({ availabilityStatus: 'not_available' });
    const naoVerif = await createCandidate({ availabilityStatus: 'actively_searching', isVerified: false });

    const ids = await getAvailableCandidateIds();

    expect(ids).toContain(ativo.id);
    expect(ids).toContain(aberto.id);
    expect(ids).toContain(processo.id);
    expect(ids).not.toContain(inativo.id);
    expect(ids).not.toContain(naoVerif.id);
  });

  test('Retorna lista vazia quando não há candidatos disponíveis', async () => {
    await createCandidate({ availabilityStatus: 'not_available' });
    const ids = await getAvailableCandidateIds();
    expect(ids).toHaveLength(0);
  });
});

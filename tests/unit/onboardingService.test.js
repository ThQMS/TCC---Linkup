'use strict';

jest.mock('../../src/helpers/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));

const { getChecklistStatus }                        = require('../../src/services/onboardingService');
const { User, Resume, Application, Favorite, AiLog, Job } = require('../../src/models');
const { useDatabase }                               = require('../helpers/db');
const { createCandidate, createCompany, createJob, createApplication } = require('../helpers/factories');

useDatabase();

// ─── Helpers locais ────────────────────────────────────────────────────────────

async function createAiLog(userId) {
    return AiLog.create({ userId, feature: 'test', durationMs: 100, success: true });
}

async function createFavorite(userId, jobId) {
    return Favorite.create({ userId, jobId });
}

// ─── Usuário não verificado ────────────────────────────────────────────────────

describe('getChecklistStatus — usuário não verificado', () => {
    test('Retorna checklist vazio sem consultar o banco', async () => {
        const user   = await createCandidate({ isVerified: false });
        const result = await getChecklistStatus(user.toJSON());

        expect(result.items).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.allDone).toBe(false);
        expect(result.shouldShow).toBe(false);
    });
});

// ─── Candidato — itens do checklist ───────────────────────────────────────────

describe('getChecklistStatus — candidato', () => {
    test('Candidato recém-criado tem todos os itens pendentes', async () => {
        const user   = await createCandidate({ bio: null, city: null, availabilityUpdatedAt: null });
        const result = await getChecklistStatus(user.toJSON());

        expect(result.total).toBe(6);
        expect(result.completed).toBe(0);
        expect(result.allDone).toBe(false);
        expect(result.shouldShow).toBe(true);
        result.items.forEach(item => expect(item.done).toBe(false));
    });

    test('Item "perfil" marcado quando bio e city estão preenchidos', async () => {
        const user   = await createCandidate({ bio: 'Sou dev', city: 'BH' });
        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'perfil');

        expect(item.done).toBe(true);
    });

    test('Item "perfil" pendente quando bio está em branco', async () => {
        const user   = await createCandidate({ bio: '   ', city: 'BH' });
        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'perfil');

        expect(item.done).toBe(false);
    });

    test('Item "curriculo" marcado quando Resume existe', async () => {
        const user = await createCandidate();
        await Resume.create({ userId: user.id, summary: 'Dev', skills: '[]', experiences: '[]', education: '[]' });
        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'curriculo');

        expect(item.done).toBe(true);
    });

    test('Item "candidatura" marcado quando há pelo menos uma candidatura', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);
        const user    = await createCandidate();
        await createApplication(job.id, user.id);

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'candidatura');
        expect(item.done).toBe(true);
    });

    test('Item "ia" marcado quando há pelo menos um AiLog', async () => {
        const user = await createCandidate();
        await createAiLog(user.id);

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'ia');
        expect(item.done).toBe(true);
    });

    test('Item "favorito" marcado quando há pelo menos um favorito', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);
        const user    = await createCandidate();
        await createFavorite(user.id, job.id);

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'favorito');
        expect(item.done).toBe(true);
    });

    test('Item "disponibilidade" marcado quando availabilityUpdatedAt está preenchido', async () => {
        const user   = await createCandidate({ availabilityUpdatedAt: new Date() });
        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'disponibilidade');

        expect(item.done).toBe(true);
    });

    test('progressPercent reflete proporção correta de itens concluídos', async () => {
        // bio + city → "perfil" ok; availabilityUpdatedAt: null → "disponibilidade" pendente
        const user   = await createCandidate({ bio: 'Dev', city: 'SP', availabilityUpdatedAt: null });
        const result = await getChecklistStatus(user.toJSON());
        const done   = result.items.filter(i => i.done).length;

        expect(result.progressPercent).toBe(Math.round((done / result.total) * 100));
        expect(result.progressPercent).toBeGreaterThan(0);
        expect(result.progressPercent).toBeLessThan(100);
    });

    test('shouldShow=false quando checklistDismissed=true', async () => {
        const user   = await createCandidate({ checklistDismissed: true });
        const result = await getChecklistStatus(user.toJSON());

        expect(result.shouldShow).toBe(false);
    });

    test('allDone=true e shouldShow=false quando todos os itens estão completos', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);
        const user    = await createCandidate({ bio: 'Dev', city: 'BH', availabilityUpdatedAt: new Date() });

        await Resume.create({ userId: user.id, summary: 'Dev', skills: '[]', experiences: '[]', education: '[]' });
        await createApplication(job.id, user.id);
        await createAiLog(user.id);
        await createFavorite(user.id, job.id);

        const result = await getChecklistStatus(user.toJSON());

        expect(result.allDone).toBe(true);
        expect(result.completed).toBe(6);
        expect(result.shouldShow).toBe(false);
    });
});

// ─── Empresa — itens do checklist ─────────────────────────────────────────────

describe('getChecklistStatus — empresa', () => {
    test('Empresa recém-criada tem todos os itens pendentes', async () => {
        const user   = await createCompany({ bio: null, sector: null });
        const result = await getChecklistStatus(user.toJSON());

        expect(result.total).toBe(7);
        expect(result.completed).toBe(0);
        result.items.forEach(item => expect(item.done).toBe(false));
    });

    test('Item "perfil" marcado quando bio e sector estão preenchidos', async () => {
        const user   = await createCompany({ bio: 'Somos tech', sector: 'Tecnologia' });
        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'perfil');

        expect(item.done).toBe(true);
    });

    test('Item "vaga" marcado quando empresa tem pelo menos uma vaga', async () => {
        const user = await createCompany();
        await createJob(user.id);

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'vaga');
        expect(item.done).toBe(true);
    });

    test('Item "candidaturas" marcado quando há candidatos nas vagas da empresa', async () => {
        const user      = await createCompany();
        const candidate = await createCandidate();
        const job       = await createJob(user.id);
        await createApplication(job.id, candidate.id);

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'candidaturas');
        expect(item.done).toBe(true);
    });

    test('Item "etapas" marcado quando pelo menos uma vaga tem perguntas configuradas', async () => {
        const user = await createCompany();
        await createJob(user.id, { questions: JSON.stringify([{ text: 'Tem exp em Node?' }]) });

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'etapas');
        expect(item.done).toBe(true);
    });

    test('Item "status" marcado quando empresa moveu pelo menos um candidato de "pendente"', async () => {
        const user      = await createCompany();
        const candidate = await createCandidate();
        const job       = await createJob(user.id);
        await createApplication(job.id, candidate.id, { status: 'aprovado' });

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'status');
        expect(item.done).toBe(true);
    });

    test('Item "status" pendente quando todas candidaturas ainda estão em "pendente"', async () => {
        const user      = await createCompany();
        const candidate = await createCandidate();
        const job       = await createJob(user.id);
        await createApplication(job.id, candidate.id, { status: 'pendente' });

        const result = await getChecklistStatus(user.toJSON());
        const item   = result.items.find(i => i.key === 'status');
        expect(item.done).toBe(false);
    });
});

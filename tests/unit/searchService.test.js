'use strict';

jest.mock('../../src/helpers/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));

// Mock do microserviço Python — nunca chamado em testes unitários
jest.mock('../../src/helpers/jobSearch', () => ({
  semanticSearch:   jest.fn().mockResolvedValue(null),
  getSuggestedJobs: jest.fn().mockReturnValue([]),
}));

const { buildPagination, getBlockedCompanyIds, attachBadges, getSuggestions, searchJobs } = require('../../src/services/searchService');
const { User, Application }                      = require('../../src/models');
const UserBlock                                  = require('../../src/models/UserBlock');
const { useDatabase }                            = require('../helpers/db');
const { createCandidate, createCompany, createJob, createApplication } = require('../helpers/factories');

useDatabase();

// ─── buildPagination — função pura (sem banco) ────────────────────────────────

describe('buildPagination — geração de links de paginação', () => {
    test('Página 1 de 1: sem prev, sem next', () => {
        const result = buildPagination({ page: 1, totalCount: 5, search: '', modality: '', salary: '', city: '', skill: '', isPcd: false });
        expect(result.hasPrev).toBe(false);
        expect(result.hasNext).toBe(false);
        expect(result.totalPages).toBe(1);
        expect(result.pages).toHaveLength(1);
    });

    test('Página 1 de 3: tem next, sem prev', () => {
        const result = buildPagination({ page: 1, totalCount: 24, search: '', modality: '', salary: '', city: '', skill: '', isPcd: false });
        expect(result.hasPrev).toBe(false);
        expect(result.hasNext).toBe(true);
        expect(result.totalPages).toBe(3);
    });

    test('Página 2 de 3: tem prev e next', () => {
        const result = buildPagination({ page: 2, totalCount: 24, search: '', modality: '', salary: '', city: '', skill: '', isPcd: false });
        expect(result.hasPrev).toBe(true);
        expect(result.hasNext).toBe(true);
    });

    test('Última página: tem prev, sem next', () => {
        const result = buildPagination({ page: 3, totalCount: 24, search: '', modality: '', salary: '', city: '', skill: '', isPcd: false });
        expect(result.hasPrev).toBe(true);
        expect(result.hasNext).toBe(false);
    });

    test('Sem resultados: 0 páginas, sem prev, sem next', () => {
        const result = buildPagination({ page: 1, totalCount: 0, search: '', modality: '', salary: '', city: '', skill: '', isPcd: false });
        expect(result.totalPages).toBe(0);
        expect(result.pages).toHaveLength(0);
        expect(result.hasPrev).toBe(false);
        expect(result.hasNext).toBe(false);
    });

    test('Parâmetros de busca são incluídos nas URLs de paginação', () => {
        const result = buildPagination({ page: 1, totalCount: 16, search: 'backend', modality: 'remoto', salary: '', city: '', skill: '', isPcd: false });
        expect(result.nextUrl).toContain('job=backend');
        expect(result.nextUrl).toContain('modality=remoto');
    });

    test('Filtro isPcd é incluído nas URLs quando ativo', () => {
        const result = buildPagination({ page: 1, totalCount: 16, search: '', modality: '', salary: '', city: '', skill: '', isPcd: true });
        expect(result.nextUrl).toContain('isPcd=1');
    });

    test('Filtros com valor "todos" não aparecem nas URLs', () => {
        const result = buildPagination({ page: 1, totalCount: 16, search: '', modality: 'todos', salary: 'todos', city: 'todos', skill: 'todos', isPcd: false });
        expect(result.nextUrl).not.toContain('modality');
        expect(result.nextUrl).not.toContain('salary');
        expect(result.nextUrl).not.toContain('city');
        expect(result.nextUrl).not.toContain('skill');
    });

    test('Cada página possui number, active e url corretos', () => {
        const result = buildPagination({ page: 2, totalCount: 24, search: '', modality: '', salary: '', city: '', skill: '', isPcd: false });
        const activePage = result.pages.find(p => p.active);
        expect(activePage.number).toBe(2);
        expect(activePage.url).toContain('page=2');
        result.pages.filter(p => !p.active).forEach(p => expect(p.active).toBe(false));
    });
});

// ─── getBlockedCompanyIds — integração com banco ──────────────────────────────

describe('getBlockedCompanyIds — empresas bloqueadas pelo candidato', () => {
    test('Usuário null retorna array vazio', async () => {
        const result = await getBlockedCompanyIds(null);
        expect(result).toEqual([]);
    });

    test('Empresa não tem lista de bloqueio', async () => {
        const company = await createCompany();
        const result  = await getBlockedCompanyIds(company);
        expect(result).toEqual([]);
    });

    test('Candidato sem bloqueios retorna array vazio', async () => {
        const candidate = await createCandidate();
        const result    = await getBlockedCompanyIds(candidate);
        expect(result).toEqual([]);
    });

    test('Candidato com empresa bloqueada retorna o id da empresa', async () => {
        const candidate = await createCandidate();
        const company   = await createCompany();

        await UserBlock.create({ userId: candidate.id, companyId: company.id });

        const result = await getBlockedCompanyIds(candidate);
        expect(result).toContain(company.id);
    });

    test('Candidato com múltiplas empresas bloqueadas retorna todos os ids', async () => {
        const candidate  = await createCandidate();
        const company1   = await createCompany();
        const company2   = await createCompany();

        await UserBlock.create({ userId: candidate.id, companyId: company1.id });
        await UserBlock.create({ userId: candidate.id, companyId: company2.id });

        const result = await getBlockedCompanyIds(candidate);
        expect(result).toContain(company1.id);
        expect(result).toContain(company2.id);
        expect(result).toHaveLength(2);
    });

    test('Erro no banco retorna array vazio sem lançar exceção', async () => {
        const candidate = await createCandidate();
        jest.spyOn(UserBlock, 'findAll').mockRejectedValueOnce(new Error('DB error'));
        const result = await getBlockedCompanyIds(candidate);
        expect(result).toEqual([]);
        jest.restoreAllMocks();
    });
});

// ─── searchJobs — fallback SQL (sem query semântica) ─────────────────────────

describe('searchJobs — busca SQL (fallback, sem query semântica)', () => {
    test('Sem filtros retorna vagas abertas paginadas', async () => {
        const company = await createCompany();
        await createJob(company.id, { status: 'aberta' });

        const result = await searchJobs({ search: '', modality: '', city: '', salary: '', skill: '', isPcd: false, page: 1, blockedCompanyIds: [] });

        expect(result).toHaveProperty('rows');
        expect(result).toHaveProperty('totalCount');
        expect(result.semanticUsed).toBe(false);
        expect(result.totalCount).toBeGreaterThanOrEqual(1);
    });

    test('Filtro por modalidade limita os resultados', async () => {
        const company = await createCompany();
        await createJob(company.id, { status: 'aberta', modality: 'remoto' });
        await createJob(company.id, { status: 'aberta', modality: 'presencial' });

        const result = await searchJobs({ search: '', modality: 'remoto', city: '', salary: '', skill: '', isPcd: false, page: 1, blockedCompanyIds: [] });

        result.rows.forEach(job => expect(job.modality).toBe('remoto'));
    });

    test('Vagas de empresa bloqueada são excluídas dos resultados', async () => {
        const company   = await createCompany();
        const blocked   = await createCompany();
        await createJob(company.id,  { status: 'aberta' });
        await createJob(blocked.id,  { status: 'aberta' });

        const result = await searchJobs({ search: '', modality: '', city: '', salary: '', skill: '', isPcd: false, page: 1, blockedCompanyIds: [blocked.id] });

        result.rows.forEach(job => expect(job.UserId).not.toBe(blocked.id));
    });

    test('Busca por keyword via SQL quando Python retorna null', async () => {
        const company = await createCompany();
        await createJob(company.id, { status: 'aberta', title: 'Engenheiro Backend Node' });

        const result = await searchJobs({ search: 'Backend', modality: '', city: '', salary: '', skill: '', isPcd: false, page: 1, blockedCompanyIds: [] });

        expect(result.semanticUsed).toBe(false);
        expect(result.rows.some(j => j.title.includes('Backend'))).toBe(true);
    });
});

// ─── attachBadges — enriquece vagas com selo Empresa Responsiva ───────────────

describe('attachBadges — badge empresaResponsiva nas vagas', () => {
    test('Array vazio retorna array vazio', async () => {
        const result = await attachBadges([]);
        expect(result).toEqual([]);
    });

    test('Vaga de empresa não-responsiva recebe empresaResponsiva=false', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);
        // sem candidaturas → taxa 0% → não responsiva
        const result  = await attachBadges([job]);
        expect(result[0].empresaResponsiva).toBe(false);
    });

    test('Vaga de empresa responsiva recebe empresaResponsiva=true', async () => {
        const company   = await createCompany();
        const job       = await createJob(company.id);
        const candidate = await createCandidate();

        // 5 candidaturas respondidas rapidamente → taxa 100%, tempo <= 7 dias
        await Promise.all([...Array(5)].map(() =>
            Application.create({
                jobId: job.id, userId: candidate.id, status: 'aprovado', answers: '[]',
                createdAt: daysAgo(3), updatedAt: daysAgo(0)
            })
        ));

        const result = await attachBadges([job]);
        expect(result[0].empresaResponsiva).toBe(true);
    });

    test('Objetos plain (sem toJSON) são tratados corretamente', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);
        const plain   = { id: job.id, UserId: company.id, title: job.title };

        const result = await attachBadges([plain]);
        expect(result[0]).toHaveProperty('empresaResponsiva');
    });
});

// ─── getSuggestions — vagas sugeridas para o candidato ────────────────────────

describe('getSuggestions — sugestões de vagas', () => {
    test('Retorna array (vazio quando mock não retorna sugestões)', async () => {
        const candidate = await createCandidate();
        const result    = await getSuggestions(candidate, null);
        expect(Array.isArray(result)).toBe(true);
    });

    test('Erro no banco retorna array vazio sem lançar exceção', async () => {
        const candidate = await createCandidate();
        jest.spyOn(Application, 'findAll').mockRejectedValueOnce(new Error('DB error'));
        const result = await getSuggestions(candidate, null);
        expect(result).toEqual([]);
        jest.restoreAllMocks();
    });
});

// ─── Utilitário ───────────────────────────────────────────────────────────────

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

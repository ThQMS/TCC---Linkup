'use strict';

jest.mock('../../src/helpers/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));

const { calcularMetricas, getResponsiveCompanies } = require('../../src/services/responsividadeService');
const { Job, Application }                          = require('../../src/models');
const { useDatabase }                               = require('../helpers/db');
const { createCompany, createJob, createApplication } = require('../helpers/factories');

useDatabase();

// ─── calcularMetricas — função pura (sem banco) ────────────────────────────────

describe('calcularMetricas — Selo Empresa Responsiva', () => {
    describe('Entrada vazia', () => {
        test('Sem candidaturas retorna tudo zero e empresaResponsiva=false', () => {
            const result = calcularMetricas([]);
            expect(result).toEqual({ taxaResposta: 0, tempoMedio: 0, empresaResponsiva: false });
        });
    });

    describe('Critério de taxa de resposta', () => {
        test('100% respondidas e tempo <= 7 dias → empresaResponsiva=true', () => {
            const apps = [
                { status: 'aprovado',  createdAt: daysAgo(5), updatedAt: daysAgo(0) },
                { status: 'rejeitado', createdAt: daysAgo(5), updatedAt: daysAgo(1) },
            ];
            const { taxaResposta, empresaResponsiva } = calcularMetricas(apps);
            expect(taxaResposta).toBe(100);
            expect(empresaResponsiva).toBe(true);
        });

        test('Taxa exatamente 80% e tempo <= 7 dias → empresaResponsiva=true (limite inferior)', () => {
            const apps = [
                { status: 'aprovado',  createdAt: daysAgo(3), updatedAt: daysAgo(0) },
                { status: 'rejeitado', createdAt: daysAgo(3), updatedAt: daysAgo(0) },
                { status: 'rejeitado', createdAt: daysAgo(3), updatedAt: daysAgo(0) },
                { status: 'rejeitado', createdAt: daysAgo(3), updatedAt: daysAgo(0) },
                { status: 'pendente',  createdAt: daysAgo(3), updatedAt: daysAgo(0) },
            ];
            const { taxaResposta, empresaResponsiva } = calcularMetricas(apps);
            expect(taxaResposta).toBe(80);
            expect(empresaResponsiva).toBe(true);
        });

        test('Taxa abaixo de 80% → empresaResponsiva=false', () => {
            const apps = [
                { status: 'aprovado', createdAt: daysAgo(2), updatedAt: daysAgo(0) },
                { status: 'pendente', createdAt: daysAgo(2), updatedAt: daysAgo(0) },
                { status: 'pendente', createdAt: daysAgo(2), updatedAt: daysAgo(0) },
            ];
            const { taxaResposta, empresaResponsiva } = calcularMetricas(apps);
            expect(taxaResposta).toBe(33);
            expect(empresaResponsiva).toBe(false);
        });

        test('Candidaturas expiradas contam como respondidas para o cálculo', () => {
            const apps = [
                { status: 'expirado', createdAt: daysAgo(4), updatedAt: daysAgo(0) },
                { status: 'expirado', createdAt: daysAgo(4), updatedAt: daysAgo(0) },
                { status: 'expirado', createdAt: daysAgo(4), updatedAt: daysAgo(0) },
                { status: 'expirado', createdAt: daysAgo(4), updatedAt: daysAgo(0) },
                { status: 'expirado', createdAt: daysAgo(4), updatedAt: daysAgo(0) },
            ];
            const { taxaResposta, empresaResponsiva } = calcularMetricas(apps);
            expect(taxaResposta).toBe(100);
            expect(empresaResponsiva).toBe(true);
        });
    });

    describe('Critério de tempo médio de resposta', () => {
        test('Taxa >= 80% mas tempo médio > 7 dias → empresaResponsiva=false', () => {
            const apps = [
                { status: 'aprovado',  createdAt: daysAgo(20), updatedAt: daysAgo(0) },
                { status: 'rejeitado', createdAt: daysAgo(20), updatedAt: daysAgo(0) },
            ];
            const { tempoMedio, empresaResponsiva } = calcularMetricas(apps);
            expect(tempoMedio).toBeGreaterThan(7);
            expect(empresaResponsiva).toBe(false);
        });

        test('Tempo médio exatamente 7 dias → empresaResponsiva=true (limite superior)', () => {
            const apps = [
                { status: 'aprovado', createdAt: daysAgo(7), updatedAt: daysAgo(0) },
                { status: 'aprovado', createdAt: daysAgo(7), updatedAt: daysAgo(0) },
            ];
            const { tempoMedio, empresaResponsiva } = calcularMetricas(apps);
            expect(tempoMedio).toBe(7);
            expect(empresaResponsiva).toBe(true);
        });

        test('Sem candidaturas respondidas → tempoMedio=0', () => {
            const apps = [
                { status: 'pendente', createdAt: daysAgo(3), updatedAt: daysAgo(0) },
            ];
            const { tempoMedio } = calcularMetricas(apps);
            expect(tempoMedio).toBe(0);
        });
    });

    describe('Mistura de status', () => {
        test('Status desconhecido não conta como respondido', () => {
            const apps = [
                { status: 'em_analise', createdAt: daysAgo(2), updatedAt: daysAgo(0) },
                { status: 'pendente',   createdAt: daysAgo(2), updatedAt: daysAgo(0) },
            ];
            const { taxaResposta, empresaResponsiva } = calcularMetricas(apps);
            expect(taxaResposta).toBe(0);
            expect(empresaResponsiva).toBe(false);
        });
    });
});

// ─── getResponsiveCompanies — integração com banco ────────────────────────────

describe('getResponsiveCompanies — integração com banco', () => {
    test('Lista vazia retorna Set vazio sem consultar o banco', async () => {
        const result = await getResponsiveCompanies([]);
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    test('Empresa sem vagas não entra no Set', async () => {
        const company = await createCompany();
        const result  = await getResponsiveCompanies([company.id]);
        expect(result.has(company.id)).toBe(false);
    });

    test('Empresa com alta taxa e tempo curto recebe o selo', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);

        // Cria 5 candidaturas respondidas rapidamente
        await Promise.all([...Array(5)].map(() =>
            Application.create({ jobId: job.id, userId: company.id, status: 'aprovado',
                answers: '[]', createdAt: daysAgo(3), updatedAt: daysAgo(0) })
        ));

        const result = await getResponsiveCompanies([company.id]);
        expect(result.has(company.id)).toBe(true);
    });

    test('Empresa com muitas candidaturas pendentes não recebe o selo', async () => {
        const company = await createCompany();
        const job     = await createJob(company.id);

        // 1 respondida, 9 pendentes → taxa 10%
        await Application.create({ jobId: job.id, userId: company.id, status: 'aprovado',
            answers: '[]', createdAt: daysAgo(2), updatedAt: daysAgo(0) });
        await Promise.all([...Array(9)].map(() =>
            Application.create({ jobId: job.id, userId: company.id, status: 'pendente',
                answers: '[]', createdAt: daysAgo(2), updatedAt: daysAgo(0) })
        ));

        const result = await getResponsiveCompanies([company.id]);
        expect(result.has(company.id)).toBe(false);
    });

    test('Erro no banco retorna Set vazio sem lançar exceção', async () => {
        jest.spyOn(Job, 'findAll').mockRejectedValueOnce(new Error('DB error'));
        const result = await getResponsiveCompanies([999]);
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
        jest.restoreAllMocks();
    });
});

// ─── Utilitário ───────────────────────────────────────────────────────────────

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

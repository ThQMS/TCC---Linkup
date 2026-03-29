const express  = require('express');
const router   = express.Router();
const { Op, fn, col, literal } = require('sequelize');
const { ensureAuthenticated } = require('../middleware/auth');
const AiLog    = require('../models/AiLog');
const { User, Job, Application, Resume } = require('../models');
const logger = require('../helpers/logger');

const FEATURE_LABELS = {
    'cover-letter':       'Carta de Apresentação',
    'compatibility':      'Compatibilidade',
    'improve-job':        'Melhorar Vaga',
    'ranking':            'Ranking de Candidatos',
    'compare-candidates': 'Comparação de Candidatos',
    'interview':          'Entrevista Simulada',
    'tailoring':          'Adaptar Currículo',
    'bias-audit':         'Bias Auditor',
    'chat':               'Chat com IA'
};

const FEATURE_ICONS = {
    'cover-letter':       'bi-envelope-paper',
    'compatibility':      'bi-cpu',
    'improve-job':        'bi-stars',
    'ranking':            'bi-trophy',
    'compare-candidates': 'bi-people',
    'interview':          'bi-mic',
    'tailoring':          'bi-scissors',
    'bias-audit':         'bi-shield-check',
    'chat':               'bi-chat-dots'
};

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const userId   = req.user.id;
        const isEmpresa = req.user.userType === 'empresa';
        const now      = new Date();
        const day30ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const day60ago = new Date(now - 60 * 24 * 60 * 60 * 1000);

        const allLogs   = await AiLog.findAll({ where: { userId } });
        const totalCalls   = allLogs.length;
        const successCalls = allLogs.filter(l => l.success).length;
        const totalErrors  = totalCalls - successCalls;
        const successRate  = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
        const avgDuration  = totalCalls > 0
            ? (allLogs.reduce((s, l) => s + (l.durationMs || 0), 0) / totalCalls / 1000).toFixed(2)
            : '0.00';

        // Última atividade
        const lastLog = allLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        const lastActivity = lastLog ? new Date(lastLog.createdAt).toLocaleString('pt-BR') : 'Nenhuma';

        const featureMap = {};
        allLogs.forEach(log => {
            if (!featureMap[log.feature]) featureMap[log.feature] = { total: 0, success: 0, errors: 0, totalMs: 0 };
            featureMap[log.feature].total++;
            if (log.success) featureMap[log.feature].success++;
            else featureMap[log.feature].errors++;
            featureMap[log.feature].totalMs += log.durationMs || 0;
        });

        const features = Object.entries(featureMap)
            .map(([key, v]) => ({
                key,
                label:   FEATURE_LABELS[key] || key,
                icon:    FEATURE_ICONS[key]   || 'bi-robot',
                total:   v.total,
                success: v.success,
                errors:  v.errors,
                successPct: Math.round((v.success / v.total) * 100),
                avgMs:   (v.totalMs / v.total / 1000).toFixed(2)
            }))
            .sort((a, b) => b.total - a.total);

        // Top feature
        const topFeature = features[0] || null;

        const logs30 = allLogs.filter(l => new Date(l.createdAt) >= day30ago);
        const dailyMap = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            dailyMap[key] = 0;
        }
        logs30.forEach(l => {
            const key = new Date(l.createdAt).toISOString().slice(0, 10);
            if (dailyMap[key] !== undefined) dailyMap[key]++;
        });
        const chartLabels = Object.keys(dailyMap).map(d => {
            const [, m, day] = d.split('-');
            return `${day}/${m}`;
        });
        const chartData = Object.values(dailyMap);

        // Calls este mês vs mês anterior
        const callsThisMonth = logs30.length;
        const callsLastMonth = allLogs.filter(l => new Date(l.createdAt) >= day60ago && new Date(l.createdAt) < day30ago).length;
        const callsGrowth    = callsLastMonth > 0 ? Math.round(((callsThisMonth - callsLastMonth) / callsLastMonth) * 100) : null;

        let kpiCandidato = null;
        if (!isEmpresa) {
            const apps = await Application.findAll({ where: { userId } });
            const totalApps    = apps.length;
            const aprovados    = apps.filter(a => a.status === 'aprovado').length;
            const taxaResposta = totalApps > 0 ? Math.round((aprovados / totalApps) * 100) : 0;

            // Tailoring calls = estimativa de horas economizadas (15min cada)
            const tailoringCalls = featureMap['tailoring']?.total || 0;
            const horasEconomizadas = (tailoringCalls * 15 / 60).toFixed(1);

            // Modalidade mais atraída
            const jobIds = [...new Set(apps.map(a => a.jobId))];
            const jobs = jobIds.length > 0 ? await Job.findAll({ where: { id: { [Op.in]: jobIds } }, attributes: ['id', 'modality'] }) : [];
            const modalityCount = {};
            jobs.filter(Boolean).forEach(j => {
                if (j.modality) modalityCount[j.modality] = (modalityCount[j.modality] || 0) + 1;
            });
            const focoModalidade = Object.entries(modalityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

            // Evolução de fit (comparação antes/depois do tailoring)
            const compatCalls = featureMap['compatibility']?.total || 0;

            kpiCandidato = {
                totalApps,
                aprovados,
                taxaResposta,
                horasEconomizadas,
                focoModalidade,
                tailoringCalls,
                compatCalls,
                callsGrowth
            };
        }

        let kpiEmpresa = null;
        if (isEmpresa) {
            const jobs = await Job.findAll({ where: { UserId: userId }, attributes: ['id'] });
            const empJobIds = jobs.map(j => j.id);
            const allAppsFlat2 = empJobIds.length > 0
                ? await Application.findAll({ where: { jobId: { [Op.in]: empJobIds } }, attributes: ['userId'] })
                : [];
            const totalCandidatos = allAppsFlat2.length;

            // Horas de triagem salvas (3min por candidato)
            const horasTriagem = (totalCandidatos * 3 / 60).toFixed(1);

            // Bias Auditor
            const biasCalls = featureMap['bias-audit']?.total || 0;

            // Ranking calls = assertividade (simulado)
            const rankingCalls = featureMap['ranking']?.total || 0;

            // Talentos reutilizados (candidatos que se candidataram a mais de 1 vaga)
            const candidatoCount = {};
            allAppsFlat2.forEach(a => { candidatoCount[a.userId] = (candidatoCount[a.userId] || 0) + 1; });
            const talentosReutilizados = Object.values(candidatoCount).filter(c => c > 1).length;
            const economiaEstimada = talentosReutilizados * 2000;

            kpiEmpresa = {
                totalCandidatos,
                horasTriagem,
                biasCalls,
                rankingCalls,
                talentosReutilizados,
                economiaEstimada,
                callsGrowth
            };
        }

        res.render('ai-metrics', {
            totalCalls, successCalls, totalErrors, successRate, avgDuration,
            lastActivity, topFeature, features,
            chartLabels: JSON.stringify(chartLabels),
            chartData:   JSON.stringify(chartData),
            callsThisMonth, callsLastMonth, callsGrowth,
            isEmpresa, kpiCandidato, kpiEmpresa
        });

    } catch (err) {
        logger.error('aiMetrics', 'Erro ao carregar métricas', { err: err.message });
        req.flash('error_msg', 'Erro ao carregar métricas.');
        res.redirect('/');
    }
});

module.exports = router;
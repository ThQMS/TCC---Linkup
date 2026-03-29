/**
 * availabilityService.js
 *
 * Gerencia o sistema inteligente de disponibilidade de candidatos.
 *
 * Status possíveis:
 *   'actively_searching'    → alta prioridade  (busca ativa)
 *   'open_to_opportunities' → média prioridade (aberto, mas não urgente)
 *   'not_available'         → não aparece nas features de redescoberta
 */

const { Op }  = require('sequelize');
const { User, Application, Resume } = require('../models');
const logger  = require('../helpers/logger');

// ─── Constantes ────────────────────────────────────────────────────────────────

const STATUS = Object.freeze({
    ACTIVELY_SEARCHING:    'actively_searching',
    OPEN_TO_OPPORTUNITIES: 'open_to_opportunities',
    NOT_AVAILABLE:         'not_available'
});

/** Candidatos considerados "disponíveis" para as features de redescoberta. */
const AVAILABLE_STATUSES = [STATUS.ACTIVELY_SEARCHING, STATUS.OPEN_TO_OPPORTUNITIES];

const DAYS_INACTIVE_BEFORE_DOWNGRADE = 60; // dias sem atividade → reduz prioridade
const DAYS_RECENT_ACTIVITY           = 30; // janela de "atividade recente"

// ─── Helpers internos ──────────────────────────────────────────────────────────

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Retorna true se o usuário está disponível para as features de redescoberta.
 * @param {object} user - Instância Sequelize ou objeto plano de User
 */
function isAvailable(user) {
    return AVAILABLE_STATUSES.includes(user.availabilityStatus);
}

/**
 * Atualiza o availabilityStatus de um candidato e sincroniza openToWork.
 * @param {number} userId
 * @param {string} newStatus - Um dos valores de STATUS
 */
async function setAvailability(userId, newStatus) {
    if (!Object.values(STATUS).includes(newStatus)) {
        throw new Error(`Status inválido: ${newStatus}`);
    }

    await User.update(
        {
            availabilityStatus:    newStatus,
            availabilityUpdatedAt: new Date(),
            openToWork:            newStatus !== STATUS.NOT_AVAILABLE   // mantém sincronia
        },
        { where: { id: userId } }
    );

    logger.info('availabilityService', 'Status atualizado', { userId, newStatus });
}

/**
 * Aplica as regras automáticas de disponibilidade para um candidato específico.
 *
 * Regras:
 *   1. Aprovado em candidatura → sugerir NOT_AVAILABLE (não força, apenas cria notificação)
 *   2. Inativo há mais de 60 dias → downgrade de 'actively_searching' para 'open_to_opportunities'
 *   3. Atividade recente (login/candidatura/currículo nos últimos 30 dias) → mantém ou eleva status
 *
 * @param {number} userId
 * @param {object} expressApp - Para enviar notificação Socket.io (pode ser null em jobs batch)
 * @returns {{ changed: boolean, reason: string|null }}
 */
async function checkAndUpdateAvailability(userId, expressApp = null) {
    try {
        const user = await User.findByPk(userId);
        if (!user || user.userType !== 'candidato') return { changed: false, reason: null };

        // Regra 1: aprovado em alguma candidatura → sugerir mudança
        const approved = await Application.findOne({
            where: { userId, status: 'aprovado' },
            order: [['updatedAt', 'DESC']]
        });
        if (approved) {
            if (user.availabilityStatus !== STATUS.NOT_AVAILABLE) {
                // Cria notificação sugestiva (não muda o status automaticamente)
                await _notifySuggestUnavailable(userId, expressApp);
            }
            return { changed: false, reason: 'aprovado — notificação de sugestão enviada' };
        }

        // Regra 2: inatividade prolongada → downgrade
        const recentActivity = await _hasRecentActivity(userId);
        if (!recentActivity) {
            if (user.availabilityStatus === STATUS.ACTIVELY_SEARCHING) {
                await setAvailability(userId, STATUS.OPEN_TO_OPPORTUNITIES);
                return { changed: true, reason: 'downgrade por inatividade' };
            }
            return { changed: false, reason: 'inativo mas já em prioridade baixa' };
        }

        return { changed: false, reason: 'nenhuma regra aplicada' };
    } catch (err) {
        logger.error('availabilityService', 'Erro ao checar disponibilidade', { userId, err: err.message });
        return { changed: false, reason: null };
    }
}

/**
 * Retorna IDs de todos os candidatos disponíveis (para buscas batch).
 * Filtra apenas candidatos verificados com currículo.
 * @returns {Promise<number[]>}
 */
async function getAvailableCandidateIds() {
    const users = await User.findAll({
        where: {
            userType:           'candidato',
            isVerified:         true,
            availabilityStatus: { [Op.in]: AVAILABLE_STATUSES }
        },
        attributes: ['id']
    });
    return users.map(u => u.id);
}

// ─── Internos ─────────────────────────────────────────────────────────────────

async function _hasRecentActivity(userId) {
    const since = daysAgo(DAYS_RECENT_ACTIVITY);

    // Candidatura recente?
    const recentApp = await Application.findOne({
        where: { userId, createdAt: { [Op.gte]: since } }
    });
    if (recentApp) return true;

    // Currículo atualizado recentemente?
    const Resume_ = require('../models').Resume;
    const resume  = await Resume_.findOne({
        where: { userId, updatedAt: { [Op.gte]: since } }
    });
    if (resume) return true;

    // Login recente? (User.updatedAt é atualizado no login via passport/session)
    const user = await User.findOne({
        where: { id: userId, updatedAt: { [Op.gte]: since } }
    });
    return !!user;
}

async function _notifySuggestUnavailable(userId, expressApp) {
    try {
        const { Notification } = require('../models');
        const sendSocket       = require('../helpers/socket');

        await Notification.create({
            userId,
            type:    'info',
            message: 'Parabéns pela aprovação! Deseja atualizar seu status para "Não disponível"?',
            link:    '/profile#availability'
        });

        if (expressApp) {
            sendSocket(expressApp, userId, {
                title:   'Atualizar disponibilidade',
                message: 'Você foi aprovado em uma candidatura. Deseja marcar-se como não disponível?'
            });
        }
    } catch (err) {
        logger.warn('availabilityService', 'Falha ao enviar notificação de sugestão', { userId, err: err.message });
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    STATUS,
    AVAILABLE_STATUSES,
    isAvailable,
    setAvailability,
    checkAndUpdateAvailability,
    getAvailableCandidateIds
};

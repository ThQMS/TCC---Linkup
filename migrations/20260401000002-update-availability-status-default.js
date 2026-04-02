'use strict';

/**
 * Atualiza o sistema de disponibilidade de 3 para 4 status.
 *
 * Mudanças:
 *   1. Altera o DEFAULT da coluna availabilityStatus de 'not_available'
 *      para 'actively_searching' — novos candidatos entram como buscando ativamente.
 *   2. Migra candidatos existentes com status 'not_available' que ainda
 *      não interagiram com o sistema para 'actively_searching', pois o
 *      antigo default era conservador e não refletia a intenção real do usuário.
 *
 * Observação: o valor 'in_selection_process' é uma STRING válida e não requer
 * alteração de schema — o campo já é DataTypes.STRING sem constraints de enum.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Muda o DEFAULT da coluna no banco
        await queryInterface.changeColumn('Users', 'availabilityStatus', {
            type:         Sequelize.STRING,
            allowNull:    false,
            defaultValue: 'actively_searching'
        });

        // 2. Candidatos que nunca alteraram o status manualmente (availabilityUpdatedAt IS NULL)
        //    e estão como 'not_available' são migrados para 'actively_searching'.
        //    Quem definiu explicitamente 'not_available' (tem availabilityUpdatedAt) é preservado.
        await queryInterface.sequelize.query(`
            UPDATE "Users"
            SET    "availabilityStatus"    = 'actively_searching',
                   "availabilityUpdatedAt" = NOW()
            WHERE  "userType"             = 'candidato'
              AND  "availabilityStatus"   = 'not_available'
              AND  "availabilityUpdatedAt" IS NULL
        `);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn('Users', 'availabilityStatus', {
            type:         Sequelize.STRING,
            allowNull:    false,
            defaultValue: 'not_available'
        });
    }
};

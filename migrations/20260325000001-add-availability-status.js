'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const table = await queryInterface.describeTable('Users');

        if (!table['availabilityStatus']) {
            await queryInterface.addColumn('Users', 'availabilityStatus', {
                type:         Sequelize.STRING,
                allowNull:    false,
                defaultValue: 'not_available'
            });
        }

        if (!table['availabilityUpdatedAt']) {
            await queryInterface.addColumn('Users', 'availabilityUpdatedAt', {
                type:      Sequelize.DATE,
                allowNull: true
            });
        }

        // Migra openToWork existente → availabilityStatus
        await queryInterface.sequelize.query(`
            UPDATE "Users"
            SET "availabilityStatus" = 'open_to_opportunities'
            WHERE "openToWork" = true
              AND "availabilityStatus" = 'not_available'
        `);
    },

    down: async (queryInterface) => {
        try { await queryInterface.removeColumn('Users', 'availabilityStatus'); }   catch (e) {}
        try { await queryInterface.removeColumn('Users', 'availabilityUpdatedAt'); } catch (e) {}
    }
};


'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('Applications');
    if (!table['answers'])         await queryInterface.addColumn('Applications', 'answers',         { type: Sequelize.TEXT, defaultValue: '[]' });
    if (!table['answersScore'])    await queryInterface.addColumn('Applications', 'answersScore',    { type: Sequelize.INTEGER });
    if (!table['answersFeedback']) await queryInterface.addColumn('Applications', 'answersFeedback', { type: Sequelize.TEXT });
  },
  down: async (queryInterface) => {
    try {
      await queryInterface.removeColumn('Applications', 'answers');
      await queryInterface.removeColumn('Applications', 'answersScore');
      await queryInterface.removeColumn('Applications', 'answersFeedback');
    } catch(e) {}
  }
};
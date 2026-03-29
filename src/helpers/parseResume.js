/**
 * Faz o parse dos campos JSON do currículo.
 * Centraliza o padrão JSON.parse(resume.X || '[]') que se repetia em 8 arquivos.
 *
 * @param {object|null} resume - Instância do modelo Resume (ou null)
 * @returns {{ skills: string[], experiences: object[], education: object[], summary: string }}
 */
function parseResume(resume) {
    if (!resume) return { skills: [], experiences: [], education: [], summary: '' };
    return {
        skills:      JSON.parse(resume.skills      || '[]'),
        experiences: JSON.parse(resume.experiences || '[]'),
        education:   JSON.parse(resume.education   || '[]'),
        summary:     resume.summary || ''
    };
}

module.exports = parseResume;

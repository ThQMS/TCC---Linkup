/**
 * Faz o parse dos campos JSON do currículo.
 * Centraliza o padrão JSON.parse(resume.X || '[]') que se repetia em 8 arquivos.
 *
 * @param {object|null} resume - Instância do modelo Resume (ou null)
 * @returns {{ skills: string[], experiences: object[], education: object[], summary: string }}
 */
function safeParse(value, fallback) {
    try {
        const parsed = JSON.parse(value || JSON.stringify(fallback));
        return parsed ?? fallback;
    } catch {
        // Currículo com JSON malformado (ex.: saída inesperada da IA) não deve
        // derrubar a página inteira — retorna o default e segue.
        return fallback;
    }
}

function parseResume(resume) {
    if (!resume) return { skills: [], experiences: [], education: [], summary: '' };
    return {
        skills:      safeParse(resume.skills,      []),
        experiences: safeParse(resume.experiences, []),
        education:   safeParse(resume.education,    []),
        summary:     resume.summary || ''
    };
}

module.exports = parseResume;

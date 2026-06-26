// Escapa caracteres especiais de HTML. Usado ao interpolar dados do usuário
// (nome, mensagem) dentro de corpos de e-mail montados como string.
module.exports = function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

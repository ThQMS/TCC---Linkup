function formatDate(d) {
    return d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function jobStatusBadge(s) {
    if (s === 'encerrada') return '<span style="background:#ffebee;color:#c62828;border-radius:20px;padding:2px 8px;font-size:.7rem;">Encerrada</span>';
    if (s === 'pausada')   return '<span style="background:#fffde7;color:#f57f17;border-radius:20px;padding:2px 8px;font-size:.7rem;">Pausada</span>';
    return '<span style="background:#e8f5e9;color:#2e7d32;border-radius:20px;padding:2px 8px;font-size:.7rem;">Aberta</span>';
}

function applicationStatusBadge(s) {
    if (s === 'aprovado')  return '<span style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:20px;padding:3px 10px;font-size:.75rem;font-weight:700">Aprovado</span>';
    if (s === 'rejeitado') return '<span style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;border-radius:20px;padding:3px 10px;font-size:.75rem;font-weight:700">Rejeitado</span>';
    return '<span style="background:#fffde7;color:#f57f17;border:1px solid #fff176;border-radius:20px;padding:3px 10px;font-size:.75rem;font-weight:700">Pendente</span>';
}

// Escapa HTML para prevenir XSS em templates gerados via string
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = { formatDate, jobStatusBadge, applicationStatusBadge, escHtml };

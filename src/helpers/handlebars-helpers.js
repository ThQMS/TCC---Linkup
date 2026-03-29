module.exports = {

    eq: (v1, v2) => v1 === v2,

    isOwner: (loggedInUserId, jobOwnerId) => loggedInUserId === jobOwnerId,

    isRecruiter: (userType) => userType === 'recrutador' || userType === 'empresa',

    formatDate: function(date) {
        if (!date) return '';
        return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    },

    json: (context) => JSON.stringify(context),

    safeJson: function(context) {
        const json = JSON.stringify(context) || 'null';
        return json
            .replace(/</g,  '\\u003c').replace(/>/g,  '\\u003e')
            .replace(/&/g,  '\\u0026').replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    },

    gt:  (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt:  (a, b) => a < b,
    lte: (a, b) => a <= b,
    add: (a, b) => (a || 0) + (b || 0),

    timeAgo: function(date) {
        if (!date) return '';
        const diffMs      = new Date() - new Date(date);
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours   = Math.floor(diffMs / 3600000);
        const diffDays    = Math.floor(diffMs / 86400000);
        if (diffMinutes < 60) return `há ${diffMinutes} min`;
        if (diffHours < 24)   return `há ${diffHours}h`;
        if (diffDays === 1)   return 'há 1 dia';
        if (diffDays < 7)     return `há ${diffDays} dias`;
        if (diffDays < 30)    return `há ${Math.floor(diffDays / 7)} semana(s)`;
        return `há ${Math.floor(diffDays / 30)} mês(es)`;
    },

    isNew: function(date) {
        if (!date) return false;
        return Math.floor((new Date() - new Date(date)) / 86400000) < 7;
    },

    formatModality: function(modality) {
        const map = { presencial: 'Presencial', hibrido: 'Híbrido', homeoffice: 'Home Office', remoto: 'Remoto' };
        if (!modality) return '';
        return map[modality] || (modality.charAt(0).toUpperCase() + modality.slice(1));
    },

    isRemote: function(modality) {
        return modality === 'homeoffice' || modality === 'remoto';
    },

    formatContractType: function(contractType) {
        const map = { clt: 'CLT', pj: 'PJ', estagio: 'Estágio', temporario: 'Temporário', freelancer: 'Freelancer' };
        if (!contractType) return '';
        return map[contractType] || contractType.toUpperCase();
    }
};
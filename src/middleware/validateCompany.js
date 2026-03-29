const axios = require('axios');
const logger = require('../helpers/logger');

// E-mails pessoais bloqueados em produção
const BLOCKED_EMAIL_DOMAINS = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com',
    'yahoo.com.br', 'hotmail.com.br', 'live.com', 'icloud.com',
    'bol.com.br', 'uol.com.br', 'terra.com.br'
];

function cleanCNPJ(cnpj) {
    return (cnpj || '').replace(/\D/g, '');
}

// Validação matemática do CNPJ (dígitos verificadores)
function isValidCNPJFormat(cnpj) {
    const c = cleanCNPJ(cnpj);
    if (c.length !== 14) return false;
    if (/^(\d)\1+$/.test(c)) return false; 

    let sum = 0, pos = 5;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(c[i]) * pos--;
        if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(c[12])) return false;

    sum = 0; pos = 6;
    for (let i = 0; i < 13; i++) {
        sum += parseInt(c[i]) * pos--;
        if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === parseInt(c[13]);
}

const validateCompany = async (req, res, next) => {
    if (process.env.VALIDATE_COMPANY !== 'true') {
        logger.debug('validateCompany', 'Validação de CNPJ desativada (dev/teste)');
        return next();
    }

    const { cnpj, email, userType } = req.body;

    if (userType !== 'empresa') return next();

    if (!email) {
        req.flash('error_msg', 'E-mail é obrigatório.');
        return res.redirect('/register');
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain || BLOCKED_EMAIL_DOMAINS.includes(emailDomain)) {
        req.flash('error_msg', 'Empresas devem usar e-mail corporativo (ex: rh@suaempresa.com.br). E-mails pessoais não são aceitos.');
        return res.redirect('/register');
    }

    if (!cnpj) {
        req.flash('error_msg', 'CNPJ é obrigatório para cadastro de empresa.');
        return res.redirect('/register');
    }

    const cnpjClean = cleanCNPJ(cnpj);

    if (!isValidCNPJFormat(cnpjClean)) {
        req.flash('error_msg', 'CNPJ inválido. Verifique os dígitos e tente novamente.');
        return res.redirect('/register');
    }

    try {
        const response = await axios.get(
            `https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`,
            { timeout: 8000 }
        );

        const data = response.data;

       
        if (data.descricao_situacao_cadastral?.toLowerCase() !== 'ativa') {
            req.flash('error_msg', `CNPJ encontrado mas situação é "${data.descricao_situacao_cadastral}". Apenas empresas ativas podem se cadastrar.`);
            return res.redirect('/register');
        }

        req.validatedCompany = {
            cnpj:          cnpjClean,
            razaoSocial:   data.razao_social,
            nomeFantasia:  data.nome_fantasia || data.razao_social,
            municipio:     data.municipio,
            uf:            data.uf
        };

        logger.info('validateCompany', `CNPJ validado: ${data.razao_social} (${cnpjClean})`);
        next();

    } catch (err) {
        if (err.response?.status === 404) {
            req.flash('error_msg', 'CNPJ não encontrado na Receita Federal. Verifique e tente novamente.');
            return res.redirect('/register');
        }

        // Se a API estiver fora do ar, deixa passar com aviso (não bloqueia o cadastro)
        logger.error('validateCompany', 'Erro ao consultar BrasilAPI', { err: err.message });
        logger.warn('validateCompany', 'API indisponível — cadastro permitido sem validação de CNPJ');
        next();
    }
};

module.exports = validateCompany;
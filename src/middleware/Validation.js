const { body, validationResult } = require('express-validator');

function sanitizeInputs(req, res, next) {
    if (req.body && typeof req.body === 'object') sanitizeObject(req.body);
    next();
}

function sanitizeObject(obj) {
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
            obj[key] = obj[key]
                .replace(/<[^>]*>/g, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '')
                .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
        }
    }
}

// Login — mensagem genérica para não vazar se o email existe ou não
const validateLogin = [
    body('email')
        .isEmail().withMessage('E-mail ou senha incorretos.')
        .normalizeEmail({ gmail_remove_dots: false, all_lowercase: true }),
    body('password')
        .notEmpty().withMessage('E-mail ou senha incorretos.')
];

const validateRegister = [
    body('name')
        .trim()
        .notEmpty().withMessage('Nome obrigatório.')
        .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres.'),
    body('email')
        .isEmail().withMessage('E-mail inválido.')
        .normalizeEmail({ gmail_remove_dots: false, all_lowercase: true }),
    body('password')
        .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres.')
        .matches(/[A-Z]/).withMessage('Senha deve conter pelo menos uma letra maiúscula.')
        .matches(/[0-9]/).withMessage('Senha deve conter pelo menos um número.'),
    body('userType')
        .isIn(['candidato', 'empresa']).withMessage('Tipo de usuário inválido.')
];

const validateJob = [
    body('title')
        .trim()
        .notEmpty().withMessage('Título obrigatório.')
        .isLength({ max: 150 }).withMessage('Título muito longo.'),
    body('company')
        .trim()
        .notEmpty().withMessage('Nome da empresa obrigatório.')
        .isLength({ max: 150 }).withMessage('Nome da empresa muito longo.'),
    body('email')
        .isEmail().withMessage('E-mail de contato inválido.')
        .normalizeEmail(),
    body('description')
        .trim()
        .notEmpty().withMessage('Descrição obrigatória.')
        .isLength({ max: 5000 }).withMessage('Descrição muito longa.'),
    body('modality')
        .optional()
        .isIn(['presencial', 'hibrido', 'homeoffice', '']).withMessage('Modalidade inválida.'),
    body('status')
        .optional()
        .isIn(['aberta', 'pausada', 'encerrada']).withMessage('Status inválido.'),
    body('contractType')
        .optional()
        .isIn(['clt', 'pj', 'estagio', 'temporario', 'freelancer', '']).withMessage('Tipo de contratação inválido.')
];

function handleValidationErrors(req, res, next, redirectTo) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const messages = errors.array().map(e => e.msg).join(' | ');
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(422).json({ error: messages });
        }
        req.flash('error_msg', messages);
        return res.redirect(redirectTo);
    }
    next();
}

const validateProfile = [
    body('name')
        .trim()
        .notEmpty().withMessage('Nome obrigatório.')
        .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres.'),
    body('bio')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 500 }).withMessage('Bio deve ter no máximo 500 caracteres.'),
    body('city')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 }).withMessage('Cidade deve ter no máximo 100 caracteres.'),
    body('github')
        .optional({ checkFalsy: true })
        .trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('URL do GitHub inválida.')
        .isLength({ max: 200 }).withMessage('URL do GitHub muito longa.'),
    body('linkedin')
        .optional({ checkFalsy: true })
        .trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('URL do LinkedIn inválida.')
        .isLength({ max: 200 }).withMessage('URL do LinkedIn muito longa.'),
    body('website')
        .optional({ checkFalsy: true })
        .trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('URL do site inválida.')
        .isLength({ max: 200 }).withMessage('URL do site muito longa.'),
    body('linkedinCompany')
        .optional({ checkFalsy: true })
        .trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('URL do LinkedIn da empresa inválida.')
        .isLength({ max: 200 }).withMessage('URL do LinkedIn muito longa.'),
    body('phone')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 20 }).withMessage('Telefone muito longo.'),
    body('address')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 200 }).withMessage('Endereço muito longo.')
];

module.exports = { sanitizeInputs, validateLogin, validateRegister, validateJob, validateProfile, handleValidationErrors };
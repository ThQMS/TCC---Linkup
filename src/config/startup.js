const REQUIRED_ENV = [
    'SESSION_SECRET',
    'GMAIL_USER',
    'GMAIL_PASS',
    'GROQ_API_KEY',
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASS'
];

// Variáveis com padrão implícito — apenas aviso, não bloqueia a inicialização
const DEFAULT_ENV = {
    DB_PORT: '5432',
    PORT:    '3000'
};

// Variáveis obrigatórias apenas em produção
const REQUIRED_PROD_ENV = [
    'REDIS_URL'
];

function validateEnv() {
    const missing = REQUIRED_ENV.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error('\n❌ Variáveis de ambiente obrigatórias não definidas:');
        missing.forEach(key => console.error(`   - ${key}`));
        console.error('\nDefina essas variáveis no arquivo .env e reinicie o servidor.\n');
        process.exit(1);
    }

    for (const [key, defaultValue] of Object.entries(DEFAULT_ENV)) {
        if (!process.env[key]) {
            process.env[key] = defaultValue;
            console.warn(`⚠️  ${key} não definida — usando padrão: ${defaultValue}`);
        }
    }

    if (process.env.NODE_ENV === 'production') {
        const missingProd = REQUIRED_PROD_ENV.filter(key => !process.env[key]);
        if (missingProd.length > 0) {
            console.error('\n❌ Variáveis obrigatórias em produção não definidas:');
            missingProd.forEach(key => console.error(`   - ${key}`));
            console.error('\nDefina essas variáveis antes de iniciar em produção.\n');
            process.exit(1);
        }
    }
}

module.exports = { validateEnv };
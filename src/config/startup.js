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

function validateEnv() {
    const missing = REQUIRED_ENV.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error('\n❌ Variáveis de ambiente obrigatórias não definidas:');
        missing.forEach(key => console.error(`   - ${key}`));
        console.error('\nDefina essas variáveis no arquivo .env e reinicie o servidor.\n');
        process.exit(1);
    }
}

module.exports = { validateEnv };
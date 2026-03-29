const groq = require('./groq');

const DEFAULT_MODEL   = 'llama-3.3-70b-versatile';
const MAX_RETRIES     = 2;
const RETRY_BASE_MS   = 1000;
const REQUEST_TIMEOUT = 30000;

async function chatComplete(messages, opts = {}) {
    const {
        model       = DEFAULT_MODEL,
        max_tokens  = 500,
        temperature = 0.7,
        retries     = MAX_RETRIES
    } = opts;

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const timeout    = new Promise((_, rej) => setTimeout(() => rej(new Error('AI request timeout')), REQUEST_TIMEOUT));
            const completion = await Promise.race([
                groq.chat.completions.create({ model, messages, max_tokens, temperature }),
                timeout
            ]);
            return completion.choices[0]?.message?.content?.trim() ?? '';
        } catch (err) {
            lastErr = err;
            const status = err?.status ?? err?.statusCode;
            const shouldRetry = (status === 429 || (status >= 500 && status < 600)) && attempt < retries;
            if (!shouldRetry) throw err;
            await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
        }
    }
    throw lastErr;
}

module.exports = { chatComplete };

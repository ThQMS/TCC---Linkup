const groq = require('./groq');

// Modelo centralizado e configurável por ambiente — troque GROQ_MODEL no .env
// sem mexer no código quando a Groq descontinuar um modelo.
const DEFAULT_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_RETRIES     = 2;
const RETRY_BASE_MS   = 1000;
const REQUEST_TIMEOUT = 30000;

/**
 * Extrai o primeiro objeto JSON de um texto e faz parse de forma tolerante.
 * Retorna null se não houver JSON válido (em vez de lançar).
 */
function parseJsonLoose(raw) {
    if (!raw) return null;
    const cleaned = String(raw).replace(/```json|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
}

async function chatComplete(messages, opts = {}) {
    const {
        model           = DEFAULT_MODEL,
        max_tokens      = 500,
        temperature     = 0.7,
        retries         = MAX_RETRIES,
        response_format = undefined
    } = opts;

    const params = { model, messages, max_tokens, temperature };
    if (response_format) params.response_format = response_format;

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        // AbortController: cancela DE VERDADE a chamada subjacente no timeout
        // (antes o Promise.race deixava a requisição correndo em background — vazava custo).
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
            const completion = await groq.chat.completions.create(params, { signal: controller.signal });
            return completion.choices[0]?.message?.content?.trim() ?? '';
        } catch (err) {
            lastErr = err;
            const status = err?.status ?? err?.statusCode;
            const isTimeout = err?.name === 'AbortError' || /aborted|timeout/i.test(err?.message || '');
            // Timeout passa a ser retentável (é a falha mais comum sob carga).
            const shouldRetry = (isTimeout || status === 429 || (status >= 500 && status < 600)) && attempt < retries;
            if (!shouldRetry) throw err;
            await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

/**
 * Cria um stream de chat com suporte a abort externo (ex.: cliente desconectou)
 * e timeout. Repassa o AbortSignal recebido ao SDK.
 * @param {Array} messages
 * @param {object} opts - { model, max_tokens, temperature, signal }
 */
async function streamComplete(messages, opts = {}) {
    const {
        model       = DEFAULT_MODEL,
        max_tokens  = 800,
        temperature = 0.7,
        signal
    } = opts;

    return groq.chat.completions.create(
        { model, messages, max_tokens, temperature, stream: true },
        signal ? { signal } : undefined
    );
}

module.exports = { chatComplete, streamComplete, parseJsonLoose, DEFAULT_MODEL };

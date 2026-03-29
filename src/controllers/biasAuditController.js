const { chatComplete } = require('../helpers/aiService');
const logAi            = require('../helpers/aiLog');

exports.audit = async (req, res) => {
    const start = Date.now();
    try {
        const { title, description, requirements, benefits } = req.body;
        const fullText = [title, description, requirements, benefits].filter(Boolean).join('\n\n');

        if (!fullText || fullText.trim().length < 30) {
            return res.status(400).json({ error: 'Conteúdo insuficiente para análise.' });
        }

        const raw = (await chatComplete([{
            role: 'user',
            content: `Você é um especialista em diversidade e inclusão no mercado de trabalho. Analise o texto da vaga abaixo e identifique possíveis vieses de linguagem.

TEXTO DA VAGA:
${fullText.slice(0, 3000)}

Analise vieses de:
- Gênero (linguagem exclusivamente masculina/feminina)
- Idade (termos que excluem jovens ou seniores)
- Cultura (referências culturais excludentes)
- Aparência ou características físicas
- Classe social

Retorne APENAS este JSON sem markdown:
{
  "score_inclusividade": 0-100,
  "nivel_risco": "baixo|medio|alto",
  "problemas_encontrados": [
    { "trecho": "texto original", "tipo": "genero|idade|cultura|aparencia|classe", "sugestao": "versão inclusiva" }
  ],
  "pontos_positivos": ["ponto1", "ponto2"],
  "resumo": "texto de 2 linhas sobre a vaga"
}`
        }], { max_tokens: 800, temperature: 0.2 })).replace(/```json|```/g, '');

        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'Erro ao processar análise.' });

        await logAi(req.user.id, 'bias-audit', start, true);
        res.json(JSON.parse(match[0]));
    } catch (err) {
        await logAi(req.user?.id, 'bias-audit', start, false);
        res.status(500).json({ error: 'Erro ao analisar bias.' });
    }
};

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from embedder import rank_jobs, invalidate_cache, clear_cache

app = Flask(__name__)
# Origem do CORS configurável (default localhost p/ dev). Em produção a chamada é
# server-to-server e não passa pelo browser, então CORS é irrelevante nesse caminho.
CORS(app, origins=os.environ.get('CORS_ORIGIN', 'http://localhost:3000').split(','))

# Token compartilhado opcional: se SEARCH_TOKEN estiver definido, exige o header
# x-search-token em todas as rotas exceto /health. Protege o serviço de chamadas
# não autorizadas na rede interna (ex.: clear_cache como DoS).
SEARCH_TOKEN = os.environ.get('SEARCH_TOKEN')

@app.before_request
def _check_token():
    if not SEARCH_TOKEN or request.path == '/health':
        return None
    if request.headers.get('x-search-token') != SEARCH_TOKEN:
        return jsonify({ 'error': 'unauthorized' }), 401

@app.route('/health', methods=['GET'])
def health():
    return jsonify({ 'status': 'ok', 'service': 'linkup-semantic-search', 'model': 'paraphrase-multilingual-MiniLM-L12-v2' })

@app.route('/search', methods=['POST'])
def search():
    """
    POST /search
    Body: {
        "query": "desenvolvedor remoto react",
        "jobs": [{ id, title, description, requirements, company, modality, city }],
        "limit": 20
    }
    Retorna: { "ids": [3, 7, 1, ...], "scores": { "3": 0.87, ... } }
    """
    data  = request.get_json()
    query = (data.get('query') or '').strip()
    jobs  = data.get('jobs') or []
    limit = min(int(data.get('limit', 20)), 50)

    if not query or len(query) < 2:
        return jsonify({ 'ids': [], 'scores': {} })

    if not jobs:
        return jsonify({ 'ids': [], 'scores': {}, 'total': 0 })

    try:
        ranked = rank_jobs(query, jobs, top_k=limit)
        ids    = [r['id'] for r in ranked]
        scores = { str(r['id']): round(r['score'], 4) for r in ranked }
        return jsonify({ 'ids': ids, 'scores': scores, 'total': len(ids) })

    except Exception as e:
        print(f'[SEARCH ERROR] {e}')
        return jsonify({ 'error': str(e) }), 500

@app.route('/invalidate/<int:job_id>', methods=['POST'])
def invalidate(job_id):
    invalidate_cache(job_id)
    return jsonify({ 'ok': True, 'invalidated': job_id })

@app.route('/cache/clear', methods=['POST'])
def cache_clear():
    clear_cache()
    return jsonify({ 'ok': True })

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    host = os.environ.get('HOST', '127.0.0.1')
    print(f'[LINKUP SEARCH] Iniciando microservico em {host}:{port}...')
    app.run(host=host, port=port, debug=False)
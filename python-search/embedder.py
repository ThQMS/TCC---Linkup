import re
import numpy as np
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi

MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

print(f'[EMBEDDER] Carregando modelo {MODEL_NAME}...')
model = SentenceTransformer(MODEL_NAME)
print('[EMBEDDER] Modelo carregado.')

# Cache em memória: { job_id: embedding_vector }
_cache = {}

# Expansões semânticas para queries comuns em pt-BR
QUERY_EXPANSIONS = {
    'trabalhar de casa':    'remoto home office trabalho remoto teletrabalho',
    'trabalho de casa':     'remoto home office trabalho remoto teletrabalho',
    'trabalho em casa':     'remoto home office trabalho remoto teletrabalho',
    'home office':          'remoto home office trabalho remoto teletrabalho',
    'remoto':               'remoto home office trabalho remoto teletrabalho',
    'programação':          'programação desenvolvimento developer software engenharia de software código',
    'programar':            'programação desenvolvimento developer software código',
    'desenvolvedor':        'desenvolvedor programação software fullstack backend frontend',
    'dev ':                 'desenvolvedor programador software developer',
    'ti ':                  'tecnologia da informação software sistemas desenvolvedor',
    'tecnologia':           'tecnologia software desenvolvedor sistemas',
    'rh ':                  'recursos humanos recrutamento seleção pessoas gestão de pessoas',
    'recursos humanos':     'rh recrutamento seleção pessoas gestão de pessoas',
    'marketing':            'marketing digital comunicação mídia social conteúdo',
    'financeiro':           'finanças contabilidade controladoria contábil',
    'saúde':                'saúde médico enfermagem hospitalar clínica',
    'engenharia':           'engenharia engenheiro civil elétrica mecânica',
    'vendas':               'vendas comercial representante conta cliente',
    'suporte':              'suporte técnico atendimento helpdesk infraestrutura',
    'designer':             'design ui ux interface criativo figma',
    'dados':                'dados data science analytics bi business intelligence',
    'ia ':                  'inteligência artificial machine learning deep learning',
    'devops':               'devops infraestrutura cloud aws docker kubernetes ci cd',
    'full stack':           'fullstack frontend backend web desenvolvimento',
    'front end':            'frontend react vue angular javascript css html',
    'back end':             'backend nodejs python java api rest banco de dados',
}

def expand_query(query: str) -> str:
    """Expande a query com sinônimos para melhorar recall."""
    q = query.lower().strip()
    expansions = []
    for key, expansion in QUERY_EXPANSIONS.items():
        if key.strip() in q:
            expansions.append(expansion)
    if expansions:
        return q + ' ' + ' '.join(expansions)
    return q

def tokenize(text: str) -> list:
    """Tokeniza para BM25: lowercase, remove pontuação, filtra tokens curtos."""
    text = re.sub(r'[^\w\s]', ' ', (text or '').lower())
    return [t for t in text.split() if len(t) > 1]

def build_job_text(job: dict) -> str:
    """
    Constrói o texto completo da vaga para embedding e BM25.
    Título tem peso maior (repetido 3x). Todos os campos de texto são incluídos.
    """
    title        = job.get('title', '')        or ''
    description  = job.get('description', '')  or ''
    requirements = job.get('requirements', '') or ''
    benefits     = job.get('benefits', '')     or ''
    differential = job.get('differential', '') or ''
    company      = job.get('company', '')      or ''
    city         = job.get('city', '')         or ''
    modality     = job.get('modality', '')     or ''

    # Expande modalidade para reforçar semântica de remoto/presencial
    modality_exp = modality
    m = modality.lower()
    if 'remoto' in m or 'homeoffice' in m or 'home office' in m:
        modality_exp = 'remoto home office trabalho remoto teletrabalho'
    elif 'presencial' in m:
        modality_exp = 'presencial escritório trabalho presencial'
    elif 'híbrido' in m or 'hibrido' in m:
        modality_exp = 'híbrido presencial remoto flexível'

    parts = [
        title, title, title,   # peso maior para título
        requirements,
        description,
        benefits,
        differential,
        modality_exp,
        company,
        city
    ]
    return ' '.join(p for p in parts if p).strip()

def embed(text: str, is_query: bool = False) -> np.ndarray:
    """Vetoriza um texto. Embeddings normalizados: dot product == cosine similarity."""
    return model.encode(text, convert_to_numpy=True, normalize_embeddings=True)

def embed_job(job: dict) -> np.ndarray:
    return embed(build_job_text(job))

def rrf_score(rank: int, k: int = 60) -> float:
    """
    Reciprocal Rank Fusion: combina rankings sem precisar calibrar pesos.
    k=60 é o valor padrão da literatura; controla a penalidade por rank baixo.
    """
    return 1.0 / (k + rank + 1)

def rank_jobs(query: str, jobs: list, top_k: int = 20) -> list:
    if not jobs:
        return []

    expanded = expand_query(query)

    # ── 1. Semântico ─────────────────────────────────────────────────────────
    query_vec = embed(expanded)

    semantic_raw = []
    for job in jobs:
        job_id = job.get('id')
        if job_id not in _cache:
            _cache[job_id] = embed_job(job)
        sim = float(np.dot(query_vec, _cache[job_id]))
        semantic_raw.append((job_id, sim))

    semantic_sorted = sorted(semantic_raw, key=lambda x: x[1], reverse=True)
    semantic_scores = dict(semantic_raw)

    # ── 2. BM25 (keyword matching) ────────────────────────────────────────────
    job_texts  = [tokenize(build_job_text(j)) for j in jobs]
    job_ids    = [j.get('id') for j in jobs]
    q_tokens   = tokenize(expanded)

    bm25       = BM25Okapi(job_texts)
    bm25_raw   = bm25.get_scores(q_tokens)
    bm25_sorted = sorted(zip(job_ids, bm25_raw), key=lambda x: x[1], reverse=True)

    # ── 3. Reciprocal Rank Fusion ────────────────────────────────────────────
    sem_rank  = {jid: rank for rank, (jid, _) in enumerate(semantic_sorted)}
    bm25_rank = {jid: rank for rank, (jid, _) in enumerate(bm25_sorted)}

    rrf = {}
    for job in jobs:
        jid = job.get('id')
        rrf[jid] = (
            rrf_score(sem_rank.get(jid, len(jobs))) +
            rrf_score(bm25_rank.get(jid, len(jobs)))
        )

    # ── 4. Threshold semântico + retorno ────────────────────────────────────
    # 0.25 calibrado para o modelo paraphrase-multilingual-MiniLM-L12-v2.
    # Esse modelo separa bem domínios diferentes (RH vs Frontend ~ 0.15-0.20).
    THRESHOLD = 0.25

    results = []
    for jid, score in sorted(rrf.items(), key=lambda x: x[1], reverse=True):
        if semantic_scores.get(jid, 0) >= THRESHOLD:
            results.append({'id': jid, 'score': round(score, 6)})
        if len(results) >= top_k:
            break

    return results

def invalidate_cache(job_id: int):
    """Remove uma vaga do cache (quando editada ou deletada)."""
    _cache.pop(job_id, None)

def clear_cache():
    _cache.clear()
    print('[EMBEDDER] Cache limpo.')

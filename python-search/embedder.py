import re
import os
import hashlib
from collections import OrderedDict
import numpy as np
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi

MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

print(f'[EMBEDDER] Carregando modelo {MODEL_NAME}...')
model = SentenceTransformer(MODEL_NAME)
print('[EMBEDDER] Modelo carregado.')

# Cache em memória LRU: { job_id: (content_hash, embedding_vector) }.
# A chave inclui um hash do conteúdo: se a vaga é editada, o hash muda e o
# embedding é recalculado automaticamente — não depende só do /invalidate.
_cache = OrderedDict()
_CACHE_MAX = int(os.environ.get('EMBED_CACHE_MAX', '5000'))

def _content_hash(job: dict) -> str:
    return hashlib.md5(build_job_text(job).encode('utf-8')).hexdigest()

def _cache_get(job: dict) -> np.ndarray:
    job_id = job.get('id')
    h = _content_hash(job)
    cached = _cache.get(job_id)
    if cached and cached[0] == h:
        _cache.move_to_end(job_id)
        return cached[1]
    vec = embed_job(job)
    _cache[job_id] = (h, vec)
    _cache.move_to_end(job_id)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)  # remove o menos recentemente usado
    return vec

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
        k = key.strip()
        # Match por palavra inteira (evita 'ia' casar em 'midia', 'dev' em 'develop').
        if re.search(r'\b' + re.escape(k) + r'\b', q):
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
        job_vec = _cache_get(job)
        sim = float(np.dot(query_vec, job_vec))
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
    # Configurável via env EMBED_THRESHOLD para recalibrar sem mexer no código.
    THRESHOLD = float(os.environ.get('EMBED_THRESHOLD', '0.25'))

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

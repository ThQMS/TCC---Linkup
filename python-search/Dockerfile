FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

# Servidor de produção (gunicorn) em vez do dev server do Flask.
# 2 workers; timeout maior porque o 1º request carrega o modelo de embeddings.
# `app:app` = objeto Flask `app` no módulo app.py.
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5001", "--timeout", "120", "app:app"]

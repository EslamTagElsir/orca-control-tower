FROM python:3.11-slim

WORKDIR /app

# LightGBM/CatBoost native runtime dependency on Debian slim.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.railway.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.railway.txt

COPY src/ ./src/
COPY configs/ ./configs/
COPY artifacts/model_registry/v2/ ./artifacts/model_registry/v2/
COPY artifacts/causal/ ./artifacts/causal/

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Railway injects PORT. 8000 remains a safe local fallback.
CMD ["sh", "-c", "uvicorn delay_intelligence.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

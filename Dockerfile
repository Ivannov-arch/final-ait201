# ==============================================================================
# FreshGuard Backend — Dockerfile (Render & Production Container)
# ==============================================================================
FROM python:3.11-slim

# Set runtime environment flags
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Install minimal OS dependencies:
# - libgomp1: required by LightGBM & XGBoost OpenMP execution
# - curl: required for Docker & Render health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache layer: install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source and ML packages
COPY backend/ ./backend/
COPY src/ ./src/
COPY models/ ./models/
COPY data/processed/ ./data/processed/
COPY shared/ ./shared/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

EXPOSE 8000

# Start Uvicorn ASGI server
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

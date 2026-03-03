FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements first (better layer caching)
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML pipeline dependencies
COPY ml/requirements.txt /app/ml_requirements.txt
RUN pip install --no-cache-dir -r ml_requirements.txt

# Copy application code
COPY backend/ /app/backend/
COPY ml/ /app/ml/
COPY dataset/ /app/dataset/

# Set PYTHONPATH to include ml/ directory
ENV PYTHONPATH="/app/ml:/app/backend"

# Working directory for running the app
WORKDIR /app/backend

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8080/health').raise_for_status()"

# Start FastAPI with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]

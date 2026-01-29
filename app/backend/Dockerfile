# 1-sprint-L-e-m-i/app/backend/Dockerfile
# Backend image for FastAPI app
# - Based on official slim Python image (match your local Python version)
# - Installs system deps needed to build wheels, installs Python deps from requirements.txt
# - Copies application code and runs uvicorn
#
# Build (from repository root):
#   docker build -t recipe-backend:dev -f app/backend/Dockerfile app/backend
#
# Run (example):
#   docker run --rm -p 8000:8000 --env DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname recipe-backend:dev

# Use a slim official Python image (adjust version if needed)
FROM python:3.13-slim

# Prevent Python from writing .pyc files and ensure output is shown immediately
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory inside the container
WORKDIR /app

# Install minimal system dependencies required for many Python packages
# Keep image lean by cleaning apt caches in the same RUN step
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       ca-certificates \
       gcc \
       libffi-dev \
       libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first to leverage Docker layer cache
COPY requirements.txt /app/requirements.txt

# Upgrade pip and install Python dependencies (no cache)
RUN python -m pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r /app/requirements.txt

# Copy application source code
# The build context should be set to the backend folder so this copies your backend package (app/) and related files
COPY . /app

# Create a non-root user and ensure ownership of the workdir
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Environment defaults (can be overridden at runtime)
ENV HOST=0.0.0.0
ENV PORT=8000

# Expose the port uvicorn will listen on
EXPOSE ${PORT}

# Default command: start uvicorn
# For development you may want to add --reload (not recommended in production).
# The container will pick up DATABASE_URL from environment if provided.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

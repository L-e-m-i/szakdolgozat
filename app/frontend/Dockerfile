# Multi-stage Dockerfile for frontend
# - Default (no --target): production image with react-router-serve
# - `dev` target: Vite dev server for local development
#
# Usage:
#  Production (default):
#    docker build -t recipe-frontend -f app/frontend/Dockerfile .
#    docker run --rm -p 3000:3000 recipe-frontend
#
#  Dev:
#    docker build -t recipe-frontend:dev -f app/frontend/Dockerfile --target dev .
#    docker run --rm -p 5173:5173 recipe-frontend:dev

# -----------------------
# Base: Install deps (cacheable)
# -----------------------
FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     python3 \
     build-essential \
     git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --silent

# -----------------------
# Build stage
# -----------------------
FROM node:22-slim AS build
WORKDIR /app

# Pass VITE_API_BASE_URL from build arg to env for Vite
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# -----------------------
# Dev image (must come BEFORE production so production is DEFAULT)
# -----------------------
FROM node:22-slim AS dev
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     python3 \
     build-essential \
     git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --silent
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# -----------------------
# Production image (DEFAULT - last stage)
# -----------------------
FROM node:22-slim AS production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY --from=build /app/build /app/build
COPY --from=deps /app/node_modules ./node_modules

# Render sets PORT env var; default to 3000
ENV PORT=3000
EXPOSE ${PORT}

CMD ["npm", "run", "start"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- --timeout=2 http://127.0.0.1:${PORT}/ || exit 1

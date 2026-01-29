# Multi-stage Dockerfile for frontend
# - `production` target: builds the Vite app and serves the static `dist` with nginx
# - `dev` target: runs the Vite dev server for local development with HMR
#
# Usage examples:
#  Build production image:
#    docker build -t recipe-frontend:prod -f app/frontend/Dockerfile --target production .
#  Run production container (serves on port 80):
#    docker run --rm -p 80:80 recipe-frontend:prod
#
#  Build dev image:
#    docker build -t recipe-frontend:dev -f app/frontend/Dockerfile --target dev .
#  Run dev container (exposes Vite default port 5173):
#    docker run --rm -p 5173:5173 -v $(pwd):/app -v /app/node_modules recipe-frontend:dev
#
# NOTE: This Dockerfile assumes `npm run build` produces a `dist/` directory.

# -----------------------
# Install deps (cacheable)
# -----------------------
# Use glibc-based Node image to avoid rollup native module / musl issues.
FROM node:22-slim AS deps
WORKDIR /app

# Install minimal build tools commonly required by native npm packages.
# This helps ensure `npm ci` can build native addons when necessary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     python3 \
     build-essential \
     git \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies (production + dev for build)
RUN npm ci --silent

# -----------------------
# Build stage
# -----------------------
FROM node:22-slim AS build
WORKDIR /app

# Reuse installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY . .

# Build the app (expects a "build" script that generates `dist/` directory)
RUN npm run build

# -----------------------
# Production image
# -----------------------
FROM node:22-slim AS production
WORKDIR /app

# copy package manifests so `npm run start` can be used
COPY package.json package-lock.json* ./

# copy built server + client
COPY --from=build /app/build /app/build
COPY --from=deps /app/node_modules ./node_modules

# Expose the server port (adjust if the server uses a different port)
EXPOSE 3000

# Run the built server via the package.json `start` script
CMD ["npm","run","start"]

# Healthcheck (optional)
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- --timeout=2 http://127.0.0.1:80/ || exit 1

# -----------------------
# Dev image (node + Vite)
# -----------------------
FROM node:22-slim AS dev
WORKDIR /app

# Install minimal build tools similar to deps image so dev installs succeed
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     python3 \
     build-essential \
     git \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests and install dev dependencies
COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy the rest of the project (useful if running without mounts)
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Default command for development:
# - `npm run dev` should start Vite with host 0.0.0.0 (so container is accessible).
# Ensure your package.json dev script includes something like: "dev": "vite --host"
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

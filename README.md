# Recipe App — Monorepo (Frontend + Backend + DB)

This repository contains a full-stack recipe application (React + Vite frontend, FastAPI backend, PostgreSQL DB) organized under the `app/` directory. The project is designed to be run via Docker Compose for both development and production workflows.

This README emphasizes quick discovery and scannability for reviewers — key commands and links are placed near the top so a reviewer (or your konzulens) can get the app running and verify the API quickly.

---

## Table of contents

- [Recipe App — Monorepo (Frontend + Backend + DB)](#recipe-app--monorepo-frontend--backend--db)
  - [Table of contents](#table-of-contents)
  - [Quick start](#quick-start)
  - [Repository layout](#repository-layout)
  - [Tech stack](#tech-stack)
    - [Frontend](#frontend)
    - [Backend](#backend)
    - [Database](#database)
    - [Dev \& Deployment Tooling](#dev--deployment-tooling)
    - [Testing \& CI](#testing--ci)
    - [Code generation (overview)](#code-generation-overview)
  - [Prerequisites](#prerequisites)
  - [Environment variables](#environment-variables)
  - [Development — Docker Compose (recommended)](#development--docker-compose-recommended)
  - [Production build / Server-side rendering (SSR) frontend](#production-build--server-side-rendering-ssr-frontend)
  - [Running services individually (local dev without Docker)](#running-services-individually-local-dev-without-docker)
  - [Testing](#testing)
  - [CI notes](#ci-notes)
  - [Useful commands](#useful-commands)
  - [Directory tree (visual)](#directory-tree-visual)
  - [Diagrams](#diagrams)
    - [Entity-Relationship diagram](#entity-relationship-diagram)
    - [Sequence diagram](#sequence-diagram)

---

## Quick Start

Follow these steps to clone and start the app quickly (dev mode):

```/dev/null/quickstart.sh#L1-6
# Clone and run with one command (replace <repo-url>)
git clone <repo-url>
cd app && cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

After the stack is up:
- Frontend (Vite dev server): http://localhost:5173
- Backend (FastAPI + Uvicorn): http://localhost:8000
- Interactive API docs (Swagger/UI): http://localhost:8000/docs

If you only want to run production images (build + start):

```/dev/null/prod-start.sh#L1-3
docker compose -f app/docker-compose.yml up -d --build
# Frontend production SSR server default: http://localhost:3000
```

---

## Repository layout

Key folders and files (rooted at `app/`):

- `app/docker-compose.yml` — base Compose file (production defaults; references `.env`).
- `app/docker-compose.dev.yml` — development override (dev servers, mounts, hot reload).
- `app/frontend/` — Frontend app (Vite + React + TypeScript).
  - `app/frontend/Dockerfile` — multi-stage (dev & production/SSR targets).
  - `app/frontend/package.json` — scripts & deps.
  - `app/frontend/src/` — frontend source.
- `app/backend/` — FastAPI backend.
  - `app/backend/Dockerfile` — backend image.
  - `app/backend/app/` — backend package (endpoints, models, config).
- `app/.env` — environment variables for Compose (create locally).
- `app/README.md` — detailed project README (this file is a high-level reviewer-focused summary).

---

## Tech stack

Core technologies (bolded for quick scanning):

- Frontend:
  - **React** (TypeScript)
  - **Vite** (dev server, fast builds)
  - **React Router** (v7)
  - **Tailwind CSS**
- Backend:
  - **FastAPI** (automatic OpenAPI generation, async)
  - **Pydantic** (validation & settings)
  - **SQLAlchemy** (ORM)
  - **Uvicorn** (ASGI server)
- Database:
  - **PostgreSQL** (official Docker image)
- Dev & Deployment:
  - **Docker** & **Docker Compose**
- Testing & CI:
  - **pytest** (backend)
  - **vitest** (frontend tests / unit)

Quick stack visualization:

- Browser -> Vite dev server (`5173`) or SSR server (`3000`)
- Vite / SSR frontend -> HTTP -> Backend (`8000`)
- Backend -> SQL -> Postgres container / named volume

(Tech names above are bold to make them easy to spot for reviewers.)

---

## Prerequisites

- Docker & Docker Compose (v2) — Docker Desktop on Windows/macOS recommended.
- Node.js 22.x (for local frontend tasks / typegen).
- Python 3.10+ (for running backend tests locally, if not using Docker).
- Git

Note: If you use the recommended Docker Compose flow you do not need Node or Python installed locally.

---

## Environment variables

Create `app/.env` (or copy from `.env.example`) and provide at minimum DB credentials and frontend API base:

```
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=db
VITE_API_BASE_URL=http://backend:8000
```

(The Compose files use variable expansion to construct `DATABASE_URL` for the backend.)

---

## Development — Docker Compose (recommended)

Start the full dev environment (build images and run dev services with hot reload):

```/dev/null/dev-compose.sh#L1-3
docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml up -d --build
```

What the `dev` override does:
- frontend: runs Vite dev server (port 5173) with source mounted for HMR.
- backend: runs with `uvicorn --reload` for auto reloads on code changes.
- Postgres: runs with persistent named volume (`db_data`).

Common checks:

```/dev/null/logs-check.sh#L1-3
docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml logs -f frontend
docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml logs -f backend
```

Windows HMR tips:
- If HMR doesn't trigger, set `CHOKIDAR_USEPOLLING="true"` and `CHOKIDAR_INTERVAL="1000"` in frontend dev env (see `docker-compose.dev.yml`).
- Avoid `:delegated`/`:cached` on Windows bind mounts — use plain bind mounts for reliability.

---

## Production build / SSR frontend

- The frontend `Dockerfile` supports an SSR production target that emits a `build/` server bundle.
- The production image should run the included `start` script (for example: `npm run start`) which launches a Node-based server that listens on port 3000 by default.
- Ensure Compose port mappings and healthchecks target the server port (`3000`) when using the production image.

Build and start production stack:

```/dev/null/prod-build.sh#L1-2
docker compose -f app/docker-compose.yml up -d --build
```

Note: The SSR server must be started (e.g. `npm run start`) — simply evaluating `build/server/index.js` will exit the process.

---

## Running services individually (local dev without Docker)

Frontend (local):
- Node 22 required.
- From repo root:

```/dev/null/frontend-local.sh#L1-3
npm install --prefix app/frontend
npm run --prefix app/frontend dev
```

Backend (local):
- Create virtualenv, install deps, set `DATABASE_URL` to local Postgres, then:

```/dev/null/backend-local.sh#L1-1
uvicorn app.backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## API docs (FastAPI / Swagger)

Because the backend uses **FastAPI**, it exposes automatic interactive API documentation.

- Once the backend is running, the interactive API documentation is available at:
  - Swagger UI: http://localhost:8000/docs
  - ReDoc: http://localhost:8000/redoc

These docs make it trivial for a reviewer to exercise endpoints and inspect request/response schemas.

---

## Testing

Backend tests use `pytest`. Tests that touch the DB need a running Postgres and a `DATABASE_URL` pointing to a test database.

Example local test flow:

```/dev/null/test-flow.sh#L1-5
# Start a local Postgres for tests:
docker run --name test-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=test_db -p 5432:5432 -d postgres:15

export DATABASE_URL="postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/test_db"
pytest -q
```

Gotchas:
- Ensure unique test module names to avoid pytest import collision.
- Some tests expect DB schema/migrations in place — prepare fixtures as needed.

---

## Useful commands

- Start dev stack:

```/dev/null/useful-commands.sh#L1-2
docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml up -d --build
```

- Stop and remove containers:

```/dev/null/useful-commands.sh#L3-3
docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml down
```

- Run backend tests:

```/dev/null/useful-commands.sh#L4-4
pytest -q
```

- Generate frontend types from OpenAPI (if using dev container):

```/dev/null/useful-commands.sh#L5-5
docker exec -it recipe-frontend-dev npm run gen:openapi
```

---

## Directory tree (visual)

A concise visual tree to help reviewers:

```
app/
├── backend/                 # FastAPI & SQLAlchemy
│   ├── app/                 # Python package (API endpoints, models, services)
│   ├── tests/               # Backend tests (pytest)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                # React & Vite
│   ├── src/                 # React source (components, routes, hooks)
│   ├── public/              # Static assets
│   ├── types/               # Generated OpenAPI TypeScript types
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── README.md
```

---

## Diagrams

Diagrams are stored in `docs/diagrams/`:

- `docs/diagrams/er.png` — Entity-Relationship diagram (users, saved_recipes, refresh_tokens, etc.)
- `docs/diagrams/sequence.png` — Example sequence for authentication + recipe save flow

---

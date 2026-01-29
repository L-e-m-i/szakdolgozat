# Recipe App — Monorepo (Frontend + Backend + DB)

This repository contains a full-stack recipe application used for development, testing, and CI workflows.  
It is organized under the `app` directory and includes a React frontend (Vite), a Python FastAPI backend, and a PostgreSQL database. The project is designed to be run via Docker Compose for both production and development workflows.

This README documents how to get started, run the app in development and production, and run tests.

---

## Table of contents

- [Recipe App — Monorepo (Frontend + Backend + DB)](#recipe-app--monorepo-frontend--backend--db)
  - [Table of contents](#table-of-contents)
  - [Repository layout](#repository-layout)
  - [Technologies / Tech stack](#technologies--tech-stack)
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

## Repository layout

Key folders and files (rooted at `app/`):

- `app/docker-compose.yml` — Base Compose file (production defaults; references `.env`).
- `app/docker-compose.dev.yml` — Development override (runs frontend in dev server target and backend with `--reload`).
- `app/frontend/` — Frontend app (Vite + React Router + TypeScript).
  - `app/frontend/Dockerfile` — Multi-stage Dockerfile (dev and production targets). The production stage produces a server-side rendered (SSR) build (the server bundle lives under `build/`) and is intended to run as a Node-based server (`npm run start` / `react-router-serve`) listening on port 3000 by default. The dev target runs the Vite dev server (port 5173) for local development with HMR.
  - `app/frontend/package.json` — Frontend scripts and dependencies.
  - `app/frontend/src/` — Frontend source code.
- `app/backend/` — FastAPI backend.
  - `app/backend/Dockerfile` — Backend image.
  - `app/backend/app/` — Backend source code, tests, and configuration.
- `app/.env` — Environment variables for Compose (should be created locally; not committed).
- `app/README.md` — This file.

---

## Technologies / Tech stack

This project uses a modern full-stack toolchain. Below is a concise overview of the main technologies and why they were chosen.

### Frontend

- React (with TypeScript)
  - Component-based UI, strong TypeScript support for safer refactors and clearer public component contracts.
- Vite
  - Fast dev server with HMR (hot module replacement) and very fast builds compared to older toolchains.
- React Router (v7)
  - Declarative routing for single-page applications. The project uses React Router features and typegen tooling to generate route-aware TypeScript types where applicable.
- TypeScript
  - Statically typed JavaScript that improves developer productivity and catches many errors at build time.
- Tailwind CSS
  - Utility-first CSS framework used for fast, consistent UI styling. Integrated into the frontend build (Vite) and used across components for responsive, design-token driven UI.
- Frontend codegen
  - The repository uses generated TypeScript types (OpenAPI generated types) to keep the frontend's API models in sync with the backend API schema. The frontend re-exports generated types so consumers can `import type { components } from "../types"`, improving DX and preventing mismatches.

### Backend

- FastAPI
  - Fast, ASGI-based web framework leveraging Python type hints for automatic OpenAPI schema generation and high-performance async endpoints.
- Pydantic
  - Data validation and settings management using Python type annotations; ensures incoming/outgoing payloads match expected shapes.
- SQLAlchemy
  - Database ORM used to define models and interact with PostgreSQL. The project uses the SQLAlchemy ORM patterns for queries and models.
- Uvicorn (ASGI server)
  - Lightweight, production-capable ASGI server. In development the project uses `uvicorn --reload` for automatic reloads on code changes.
- Backend codegen
  - FastAPI's OpenAPI output can be used to generate client types and models consumed by the frontend. That codegen flow reduces manual duplication of API contracts.

### Database

- PostgreSQL (official image)
  - Reliable relational database with strong feature set. Docker Compose uses a named volume to persist data across container restarts on the same host.

### Dev & Deployment Tooling

- Docker & Docker Compose
  - Containerized development and production builds. The repo supplies a base `docker-compose.yml` and a `docker-compose.dev.yml` override for development (mounting source, enabling HMR and uvicorn auto-reload).
- Named Docker volumes
  - Used for persisting Postgres data (`db_data` volume) so data survives container recreation unless explicitly removed.

### Testing & CI

- PyTest
  - Backend unit and integration tests use pytest. Tests that touch the DB require a running Postgres instance and a `DATABASE_URL`.
- Frontend test tools
  - Frontend uses vitest; check `app/frontend/package.json` for exact scripts/dependencies.
- CI considerations
  - Frontend type generation requires Node >= 22. CI workflows should pin Node versions, install dependencies deterministically (`npm ci` with a committed `package-lock.json`), and handle Postgres service readiness robustly.

### Code generation (overview)

- OpenAPI → TypeScript
  - The backend exposes an OpenAPI schema (FastAPI produces this automatically). The repo uses code generation to produce TypeScript types from that schema so the frontend's DTOs stay consistent with the backend.
- React Router typegen
  - If the project uses React Router's type generation, Node 22 is required and the generated types are kept in the frontend codebase for reliable route typing.

---

## Prerequisites

- Docker & Docker Compose (v2). Ensure Docker Desktop is running if on Windows/macOS.
- Node.js 22.x (for local frontend tasks; CI also uses Node 22).
- Python 3.10+ (for running backend tests locally, if not using Docker).
- Git

Note: Many workflows are Docker-based — you do not need Node or Python installed locally to run the full stack if you use Docker Compose.

---

## Environment variables

Create `app/.env` with at least the database credentials and any frontend envs (example placeholders):

    POSTGRES_USER=user
    POSTGRES_PASSWORD=pass
    POSTGRES_DB=db
    VITE_API_BASE_URL=http://backend:8000

The `app/docker-compose.yml` uses variable expansion for DB creds and constructs `DATABASE_URL` for the backend from those variables.

---

## Development — Docker Compose (recommended)

The repo provides a base Compose file and a development override. Use both files together to run the full dev stack with hot-reload for frontend and backend.

Start dev environment (build images and start containers):

    docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml up -d --build

What the dev override does:

- Builds the `frontend` service using the Dockerfile's `dev` target (Vite development server).
- Mounts the frontend source directory into the container for live reloading.
- Runs the backend with `uvicorn --reload` (development mode) and mounts backend source for live reload.
- Exposes Vite dev server on port 5173 so you can access the frontend at `http://localhost:5173`.

Check logs:

    docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml logs -f frontend
    docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml logs -f backend

Confirm mounts inside containers:

    docker exec -it recipe-frontend-dev ls -la /app
    docker exec -it recipe-backend-dev ls -la /app

Notes and tips for HMR on Windows:

- Filesystem events may not reach containers reliably on Windows / Docker Desktop. If HMR does not trigger when editing files, enable polling:
  - Set `CHOKIDAR_USEPOLLING="true"` and `CHOKIDAR_INTERVAL="1000"` in the frontend dev service environment (this is already recommended in `docker-compose.dev.yml`).
  - Use a plain bind mount `./frontend:/app` (avoid `:delegated`/`:cached` on Windows).
- If you still have issues, inspect container logs and check that the source files exist inside the container.

---

## Production build / Server-side rendering (SSR) frontend

The frontend `Dockerfile` is multi-stage and contains both a `production` stage and a `dev` stage.

- The production stage now builds an SSR bundle (under `build/`) and the production image is expected to run a Node-based server that wraps the exported request handler. The project's `package.json` includes a `start` script (e.g. `react-router-serve ./build/server/index.js`) and the production image runs `npm run start` by default. Because the production image runs a Node server, the container stays alive and listens for HTTP requests (default port 3000).
- The production image must include the frontend `package.json` (or you must run the server binary directly from the installed node_modules bin). The Dockerfile copies manifests into the production stage so `npm run start` can be used inside the container.
- Update healthchecks and compose port mappings to target the actual server port (3000 by default) instead of port 80.

To build production images using the base compose (so Compose builds the `production` target), ensure `app/docker-compose.yml` sets the frontend build target to `production`, for example:

    # in app/docker-compose.yml (frontend.build)
    build:
      context: ./frontend
      target: production

Then build and bring up the production stack:

    docker compose -f app/docker-compose.yml up -d --build

If you prefer not to change the Dockerfile, you can override the container command in Compose to run the proper start command without rebuilding the image:

    services:
      frontend:
        image: recipe-prod-frontend
        command: ["npm","run","start"]
        ports:
          - "3000:3000"

Healthcheck note
- Ensure health checks probe the same port your server listens on (for example `http://127.0.0.1:3000/`), and update any Compose HEALTHCHECK lines that previously targeted port 80.

Why this change
- The SSR bundle (`build/server/index.js`) exports a request handler and does not start an HTTP server by itself. Running `node build/server/index.js` will evaluate the module and exit, causing the container to stop. Use the provided `start` script (or `npx react-router-serve ./build/server/index.js`) so a server is started and the container remains running.

---

## Running services individually (local dev without Docker)

Frontend (local):

- Ensure Node 22 is installed.
- From repo root, run frontend scripts with `--prefix` or change directory:

  npm install --prefix app/frontend
  npm run --prefix app/frontend dev

Backend (local):

- Create a virtual environment, install dependencies, and set `DATABASE_URL` environment variable to point at a running Postgres instance.
- Run:

  uvicorn app.backend.app.main:app --reload --host 0.0.0.0 --port 8000

Testing (backend):

- See [Testing](#testing) below.

Note: When running locally without Docker, you are responsible for ensuring a Postgres DB is available and `DATABASE_URL` matches it.

---

## Testing

Backend tests are PyTest-based and expect `DATABASE_URL` to be set to point at a test database instance (or a running Postgres container).

Example local flow:

1. Start a Postgres container for tests:

   docker run --name test-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=test_db -p 5432:5432 -d postgres:15

2. Export `DATABASE_URL` (example):

   export DATABASE_URL="postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/test_db"

3. Run tests from repo root:

   pytest -q

Known gotchas:

- Duplicate test module names in different folders may cause pytest to complain about import mismatch (ensure unique module names or run tests using paths).
- Some tests rely on DB migrations/fixtures; ensure DB schema matches expectations.

---

## CI notes

- Use Node 22 for frontend build/typegen in CI. React Router type generation requires requires Node >= 20 (Node 22 recommended).
- If you use GitHub Actions and self-hosted runners, avoid relying on `services:` for Postgres — using `docker run` to start Postgres inside the job mimics local environment and avoids networking conflicts with `--network host`.

- For deterministic frontend installs in CI, commit `app/frontend/package-lock.json` and use `npm ci`. If the lockfile is not present, CI should fall back to `npm install`.

---

## Useful commands

- Start dev stack (base + dev override):

  docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml up -d --build

- Build & start production stack (base only; production build target):

  docker compose -f app/docker-compose.yml up -d --build

- Quick test: build only the frontend production image and run it locally (example):

  docker compose -f app/docker-compose.yml build --no-cache frontend
  docker run --rm -p 3000:3000 recipe-prod-frontend

- Stop and remove containers:

  docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml down

- View logs:

  docker compose -f app/docker-compose.yml -f app/docker-compose.dev.yml logs -f frontend

- Run backend tests:

  pytest -q

- Inspect files inside frontend dev container:

  docker exec -it recipe-frontend-dev ls -la /app

- Generate frontend types from OpenAPI schema:

  docker exec -it recipe-frontend-dev npm run gen:openapi

---

## Directory tree (visual)

Below is a concise directory tree intended to help reviewers and developers quickly understand the repository layout.

```
app/
├── backend/                 # FastAPI & SQLAlchemy
│   ├── app/                 # Python package (API endpoints, models, services)
│   ├── tests/               # Backend tests (pytest)
│   ├── coverage/            # Backend test coverage reports
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                # React & Vite
│   ├── src/                 # React source code (components, routes, hooks)
│   ├── public/              # Static assets
│   ├── types/               # Generated OpenAPI TypeScript types (codegen output)
│   ├── package.json
│   ├── package-lock.json
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── README.md
```

---

## Diagrams

This project includes two diagrams stored in the `docs/` folder. The images are embedded here for quick reference by reviewers and developers. If you need higher-resolution or alternative formats, check `docs/` and `docs/diagrams/`.

### Entity-Relationship diagram

![Entity-Relationship diagram](docs/er.png)

Caption: ER diagram showing `users`, `saved_recipes`, `refresh_tokens`, and relationships.

### Sequence diagram

![Sequence diagram](docs/sequence.png)

Caption: Example sequence diagram that demonstrates a typical authentication + recipe-save flow (login → issue refresh token → save recipe → token verification / cascade behaviors).

---

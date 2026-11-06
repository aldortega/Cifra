# Anon

Anonimizador de documentos judiciales (Argentina).

- `frontend/`: Vite + React + TypeScript + HeroUI + Tailwind, con Oxlint y Oxfmt.
- `backend/`: FastAPI + SQLAlchemy (async) + Alembic + ARQ, con LangExtract (Gemini), PyMuPDF y python-docx.

## Con Docker

```sh
cp .env.example .env   # completar GEMINI_API_KEY
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:8000 (docs en `/docs`)

## Sin Docker

Requiere PostgreSQL y Redis corriendo localmente.

```sh
# Backend
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
uv run arq worker.settings.WorkerSettings   # en otra terminal

# Frontend
cd frontend
cp .env.example .env
pnpm install
pnpm dev
```

## Calidad

```sh
# Frontend
pnpm lint && pnpm format:check && pnpm typecheck

# Backend
uv run ruff check . && uv run ruff format --check . && uv run pytest
```

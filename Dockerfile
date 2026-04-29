# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Python backend + built frontend ──────────────────────────────────
FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install Python dependencies (cached layer — only rebuilds when lockfile changes)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=frontend /app/dist ./dist

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]

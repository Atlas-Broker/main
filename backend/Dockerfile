FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy the agents path-dependency (pyproject.toml references ../agents → /agents)
# Build context must be the repo root for this COPY to work.
COPY agents/ /agents

# Copy backend dependency files first for layer caching
COPY backend/pyproject.toml backend/uv.lock* ./

# Install dependencies (no dev deps in production)
RUN uv sync --frozen --no-dev

# Copy backend source
COPY backend/ .

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

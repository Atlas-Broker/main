import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Always allow localhost for local development regardless of CORS_ORIGINS
_DEV_ORIGINS = {"http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"}


def add_cors(app: FastAPI) -> None:
    env = os.getenv("ENVIRONMENT", "development")
    configured = {o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()}

    if env in ("development", "dev"):
        origins = list(configured | _DEV_ORIGINS)
    else:
        origins = list(configured) if configured else ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI

from api.middleware.cors import add_cors
from api.routes import signals, portfolio, trades, pipeline

load_dotenv()

logger = logging.getLogger(__name__)

KEEP_ALIVE_INTERVAL = 10 * 60


async def _keep_alive_loop(base_url: str) -> None:
    async with httpx.AsyncClient() as client:
        while True:
            await asyncio.sleep(KEEP_ALIVE_INTERVAL)
            try:
                await client.get(f"{base_url}/health", timeout=10)
                logger.debug("Keep-alive ping sent to %s", base_url)
            except Exception as exc:
                logger.warning("Keep-alive ping failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    task = None
    if render_url:
        logger.info("Starting keep-alive loop → %s", render_url)
        task = asyncio.create_task(_keep_alive_loop(render_url))
    yield
    if task:
        task.cancel()


app = FastAPI(title="Atlas API", version="0.1.0", docs_url="/docs", lifespan=lifespan)

add_cors(app)

app.include_router(signals.router)
app.include_router(portfolio.router)
app.include_router(trades.router)
app.include_router(pipeline.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
    }

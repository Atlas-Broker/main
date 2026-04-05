import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI

from api.middleware.cors import add_cors
from api.middleware.auth import ClerkAuthMiddleware
from api.routes import signals, portfolio, trades, pipeline, webhooks, profile, scheduler as scheduler_router, broker as broker_router, backtest as backtest_router, users as users_router, admin as admin_router, watchlist as watchlist_router, experiments as experiments_router

load_dotenv()

logger = logging.getLogger(__name__)

KEEP_ALIVE_INTERVAL = 10 * 60
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


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
    from scheduler.runner import scheduler_loop

    tasks: list[asyncio.Task] = []

    render_url = os.getenv("RENDER_EXTERNAL_URL")
    if render_url:
        logger.info("Starting keep-alive loop → %s", render_url)
        tasks.append(asyncio.create_task(_keep_alive_loop(render_url)))

    logger.info("Starting multi-window watchlist scheduler")
    tasks.append(asyncio.create_task(scheduler_loop()))

    yield

    for task in tasks:
        task.cancel()


docs_url = None if ENVIRONMENT == "production" else "/docs"
openapi_url = None if ENVIRONMENT == "production" else "/openapi.json"

app = FastAPI(
    title="Atlas API",
    version="0.1.0",
    docs_url=docs_url,
    openapi_url=openapi_url,
    lifespan=lifespan,
)

add_cors(app)
app.add_middleware(ClerkAuthMiddleware)

app.include_router(signals.router)
app.include_router(portfolio.router)
app.include_router(trades.router)
app.include_router(pipeline.router)
app.include_router(webhooks.router)
app.include_router(profile.router)
app.include_router(scheduler_router.router)
app.include_router(broker_router.router)
app.include_router(backtest_router.router)
app.include_router(users_router.router)
app.include_router(admin_router.router)
app.include_router(watchlist_router.router)
app.include_router(experiments_router.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": ENVIRONMENT,
    }

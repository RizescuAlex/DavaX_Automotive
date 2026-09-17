import logging
from app.models.base import engine

logger = logging.getLogger("davax")


async def on_startup():
    logger.info("DavaX Backend starting up...")
    # Connection pool is established lazily by SQLAlchemy on first use


async def on_shutdown():
    logger.info("DavaX Backend shutting down...")
    await engine.dispose()

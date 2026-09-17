from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import async_session_factory


async def get_db() -> AsyncSession:
    """Yield a database session per request, with automatic cleanup."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

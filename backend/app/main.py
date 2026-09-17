from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.router import api_router
from app.core.events import on_startup, on_shutdown


@asynccontextmanager
async def lifespan(app: FastAPI):
    await on_startup()
    yield
    await on_shutdown()


def create_app() -> FastAPI:
    application = FastAPI(
        title="DavaX Automotive API",
        description="AI In-Car Assistant Backend",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.APP_DEBUG else None,
        redoc_url="/redoc" if settings.APP_DEBUG else None,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(api_router, prefix="/api/v1")

    @application.get("/health", tags=["system"])
    async def health_check():
        return {"status": "healthy", "service": "davax-backend"}

    return application


app = create_app()

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database - No defaults, strictly required from .env
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "postgres"  # We can keep this default for docker-compose
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = ""

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Firebase
    FIREBASE_PROJECT_ID: str = ""

    # External APIs
    GOOGLE_MAPS_API_KEY: str = ""
    MAPBOX_ACCESS_TOKEN: str = ""
    OPENWEATHERMAP_API_KEY: str = ""

    # OpenAI (in-car assistant). Deliberately not VITE_-prefixed: the key must
    # stay backend-side, which is the reason the assistant route exists at all.
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4.1-mini"
    # Only for reasoning models (gpt-5 family): "none", "minimal", "low", ...
    # Left empty, no reasoning setting is sent, which non-reasoning models need.
    OPENAI_REASONING_EFFORT: str = ""

    # LiveKit voice calls
    LIVEKIT_URL: str = "wss://davax-automotive-hohl7l7d.livekit.cloud"
    LIVEKIT_API_KEY: str = "APIfo3jFabFUwpR"
    LIVEKIT_API_SECRET: str = "ADss7SCUo1aIDFU4z4df4IgExe7ODbk1mf6NO6oROkAA"
    GESTURE_BRIDGE_TOKEN: str = "OrtcmywpENld3g9slTUnht9EedvElrgNd9phGWVL7UA"

    # SmartRoute defaults
    FUEL_TANK_CAPACITY_L: int = 50
    FUEL_CONSUMPTION_L_PER_100KM: float = 7.5
    # Refueling plans preserve a practical reserve instead of targeting empty.
    FUEL_RESERVE_THRESHOLD_PCT: int = 20
    WEATHER_API_URL: str = "https://api.open-meteo.com/v1/forecast"

    # Spotify
    SPOTIFY_CLIENT_ID: str = ""
    SPOTIFY_CLIENT_SECRET: str = ""
    SPOTIFY_REDIRECT_URI: str = "http://127.0.0.1:8000/api/v1/spotify/callback"
    SPOTIFY_CACHE_PATH: str = ".spotify_cache"
    FRONTEND_URL: str = "http://localhost:5173"

    # JWT (custom email/password auth)
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # App
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:80"

    @model_validator(mode="after")
    def assemble_db_connection(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

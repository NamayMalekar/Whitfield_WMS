"""Application settings loaded from the environment / .env file."""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    APP_NAME: str = "Whitfield Fulfillment WMS"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite:///./whitfield_wms.db"

    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    AI_PROVIDER: str = "anthropic"
    AI_API_KEY: str = ""
    AI_MODEL: str = "claude-sonnet-4-6"
    AI_BASE_URL: str = "https://api.anthropic.com/v1/messages"

    DEFAULT_WAREHOUSES: str = "Reno,Columbus"

    BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    BOOTSTRAP_ADMIN_PASSWORD: str = "Whitfield#2026"
    SEED_DEMO_DATA: bool = True

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    SCRIPT_TIMEOUT_SECONDS: int = 10

    @property
    def warehouse_names(self) -> List[str]:
        return [w.strip() for w in self.DEFAULT_WAREHOUSES.split(",") if w.strip()]

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

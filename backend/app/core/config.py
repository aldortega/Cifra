from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"

    database_url: PostgresDsn = PostgresDsn("postgresql+asyncpg://anon:anon@localhost:5432/anon")
    redis_url: RedisDsn = RedisDsn("redis://localhost:6379/0")

    # Orígenes permitidos para CORS, separados por coma en la variable de entorno.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # Almacenamiento local de archivos subidos y procesados.
    storage_dir: Path = Path("./storage")
    file_ttl_hours: int = 24

    # Gemini (LangExtract).
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"

    # Sesiones.
    session_cookie_name: str = "anon_session"
    session_ttl_hours: int = 12

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

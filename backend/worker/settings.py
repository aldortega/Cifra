"""Configuración del worker ARQ. Se ejecuta con: arq worker.settings.WorkerSettings"""

from typing import Any, ClassVar

from arq.connections import RedisSettings

from app.core.config import get_settings


async def ping(ctx: dict[str, Any]) -> str:
    """Tarea de prueba para verificar que el worker procesa la cola."""
    return "pong"


class WorkerSettings:
    functions: ClassVar[list[Any]] = [ping]
    redis_settings = RedisSettings.from_dsn(str(get_settings().redis_url))
    max_jobs = 4
    job_timeout = 600

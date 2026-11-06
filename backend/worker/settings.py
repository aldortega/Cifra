"""Configuración del worker ARQ. Se ejecuta con: arq worker.settings.WorkerSettings"""

import asyncio
from typing import Any, ClassVar

from arq import cron
from arq.connections import RedisSettings

from app.anonymizer.langextract_extractor import LangExtractExtractor
from app.core.config import get_settings
from app.jobs.processing import process_job
from app.jobs.retention import purge_expired
from app.jobs.store import JobStore


async def process_job_task(ctx: dict[str, Any], job_id: str) -> None:
    """Analiza un documento con Gemini; corre en un hilo porque LangExtract es bloqueante."""
    settings = get_settings()
    extractor = LangExtractExtractor(settings.gemini_api_key, settings.gemini_model)
    await asyncio.to_thread(process_job, JobStore(settings.storage_dir), job_id, extractor)


async def purge_expired_task(ctx: dict[str, Any]) -> None:
    """Borra los archivos de los trabajos vencidos (cada hora)."""
    settings = get_settings()
    purge_expired(JobStore(settings.storage_dir), settings.file_ttl_hours)


class WorkerSettings:
    functions: ClassVar[list[Any]] = [process_job_task]
    cron_jobs: ClassVar[list[Any]] = [cron(purge_expired_task, minute=0)]
    redis_settings = RedisSettings.from_dsn(str(get_settings().redis_url))
    max_jobs = 4
    job_timeout = 600

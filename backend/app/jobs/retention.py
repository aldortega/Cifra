from datetime import UTC, datetime, timedelta

from app.jobs.store import JobStore

FINAL_STATES = {"vencido", "exportado"}


def purge_expired(store: JobStore, ttl_hours: int, now: datetime | None = None) -> int:
    """Borra original, texto y detecciones de los trabajos vencidos. Devuelve cuántos purgó."""
    now = now or datetime.now(UTC)
    purged = 0
    for job_id in store.job_ids():
        record = store.load(job_id)
        if record is None or record["estado"] in FINAL_STATES:
            continue
        if now - datetime.fromisoformat(record["creado"]) >= timedelta(hours=ttl_hours):
            store.discard_content(job_id, "vencido")
            purged += 1
    return purged

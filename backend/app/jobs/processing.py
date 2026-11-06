import time
from collections.abc import Callable
from typing import Protocol
from uuid import uuid4

from app.anonymizer.markers import ALWAYS_ACTIVE, Detection
from app.jobs.documents import RejectedDocumentError, extract_text
from app.jobs.store import JobStore

ATTEMPTS = 3
BACKOFF_SECONDS = 2.0


class Extractor(Protocol):
    def extract(self, text: str) -> list[Detection]: ...


def _to_records(detections: list[Detection], active: set[str], text_len: int) -> list[dict]:
    kept, cursor = [], 0
    for det in sorted(detections, key=lambda d: (d.start, -d.end)):
        valid = 0 <= det.start < det.end <= text_len and det.start >= cursor
        if valid and det.category in active:
            kept.append(det)
            cursor = det.end
    return [
        {
            "id": uuid4().hex,
            "categoria": d.category,
            "inicio": d.start,
            "fin": d.end,
            "estado": "pendiente",
        }
        for d in kept
    ]


def _is_gone(store: JobStore, job_id: str) -> bool:
    """El trabajo venció (o se borró) mientras se procesaba: no hay que resucitarlo."""
    current = store.load(job_id)
    return current is None or current["estado"] != "procesando"


def process_job(
    store: JobStore,
    job_id: str,
    extractor: Extractor,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Extrae el texto, detecta datos sensibles y deja el trabajo en revisión o fallido."""
    record = store.load(job_id)
    if record is None:
        return
    active = set(record["categorias"]) | ALWAYS_ACTIVE
    try:
        original = store.read_original(job_id, record["extension"])
        text = extract_text(original, record["extension"])
    except RejectedDocumentError as error:
        record.update(estado="fallido", error=str(error))
        store.save(job_id, record)
        return

    last_error = ""
    for attempt in range(ATTEMPTS):
        try:
            detections = extractor.extract(text)
        except Exception as error:
            last_error = str(error)
            if attempt < ATTEMPTS - 1:
                sleep(BACKOFF_SECONDS * 2**attempt)
            continue
        if _is_gone(store, job_id):
            return
        record.update(
            estado="en_revision",
            error=None,
            texto=text,
            detecciones=_to_records(detections, active, len(text)),
        )
        store.save(job_id, record)
        return
    if _is_gone(store, job_id):
        return
    record.update(
        estado="fallido",
        error=f"No se pudo analizar el documento tras {ATTEMPTS} intentos: {last_error}",
    )
    store.save(job_id, record)

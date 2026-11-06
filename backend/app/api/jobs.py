from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Annotated, Any, Literal

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from app.anonymizer.export_docx import UnsupportedDocumentError, export_docx
from app.anonymizer.export_pdf import export_pdf
from app.anonymizer.leak import LeakError
from app.anonymizer.markers import Detection, build_replacements
from app.core.config import get_settings
from app.jobs.documents import RejectedDocumentError, extension_of, extract_text
from app.jobs.store import JobStore

router = APIRouter(prefix="/jobs", tags=["jobs"])

MEDIA_TYPES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf": "application/pdf",
}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@lru_cache
def get_store() -> JobStore:
    return JobStore(get_settings().storage_dir)


async def get_enqueue(request: Request) -> Callable[[str], Awaitable[None]]:
    """Encola el procesamiento del trabajo en ARQ (el worker corre `process_job_task`)."""
    pool = getattr(request.app.state, "arq_pool", None)
    if pool is None:
        pool = await create_pool(RedisSettings.from_dsn(str(get_settings().redis_url)))
        request.app.state.arq_pool = pool

    async def enqueue(job_id: str) -> None:
        await pool.enqueue_job("process_job_task", job_id)

    return enqueue


class DetectionIn(BaseModel):
    id: str
    categoria: str
    inicio: int = Field(ge=0)
    fin: int = Field(ge=0)
    estado: Literal["pendiente", "confirmada", "descartada"]


class ExportIn(BaseModel):
    detecciones: list[DetectionIn]


def _public(record: dict[str, Any]) -> dict[str, Any]:
    return {
        key: record.get(key)
        for key in ("id", "nombreArchivo", "estado", "error", "texto", "detecciones")
    }


@router.post("", status_code=201)
async def create_job(
    archivo: Annotated[UploadFile, File()],
    store: Annotated[JobStore, Depends(get_store)],
    enqueue: Annotated[Callable[[str], Awaitable[None]], Depends(get_enqueue)],
    categorias: Annotated[list[str] | None, Form()] = None,
) -> dict[str, str]:
    data = await archivo.read(MAX_UPLOAD_BYTES + 1)
    try:
        if len(data) > MAX_UPLOAD_BYTES:
            raise RejectedDocumentError("El documento supera el tamaño máximo de 25 MB.")
        extension = extension_of(archivo.filename or "")
        extract_text(data, extension)  # valida tipo, límites y soporte antes de encolar
    except RejectedDocumentError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    job_id = store.create(archivo.filename or "documento", extension, categorias or [], data)
    await enqueue(job_id)
    return {"id": job_id}


@router.get("/{job_id}")
def get_job(job_id: str, store: Annotated[JobStore, Depends(get_store)]) -> dict[str, Any]:
    record = store.load(job_id)
    if record is None:
        return {"id": job_id, "nombreArchivo": "", "estado": "vencido"}
    return _public(record)


@router.post("/{job_id}/retry", status_code=202)
async def retry_job(
    job_id: str,
    store: Annotated[JobStore, Depends(get_store)],
    enqueue: Annotated[Callable[[str], Awaitable[None]], Depends(get_enqueue)],
) -> dict[str, str]:
    record = store.load(job_id)
    if record is None or record["estado"] != "fallido":
        raise HTTPException(status_code=409, detail="Solo se pueden reintentar trabajos fallidos.")
    record.update(estado="procesando", error=None)
    store.save(job_id, record)
    await enqueue(job_id)
    return {"id": job_id}


@router.post("/{job_id}/export")
def export_job(
    job_id: str, body: ExportIn, store: Annotated[JobStore, Depends(get_store)]
) -> Response:
    record = store.load(job_id)
    if record is None or record["estado"] != "en_revision":
        raise HTTPException(status_code=409, detail="El trabajo no está listo para exportar.")
    if any(d.estado == "pendiente" for d in body.detecciones):
        raise HTTPException(status_code=409, detail="Quedan detecciones sin revisar.")
    text: str = record["texto"]
    if any(d.fin > len(text) or d.fin <= d.inicio for d in body.detecciones):
        raise HTTPException(status_code=422, detail="Hay detecciones fuera del texto.")
    submitted = {d.id for d in body.detecciones}
    if any(stored["id"] not in submitted for stored in record["detecciones"]):
        raise HTTPException(status_code=409, detail="Quedan detecciones sin revisar.")
    minors = {s["id"] for s in record["detecciones"] if s["categoria"] == "MENOR"}
    confirmed = [
        Detection(d.categoria, d.inicio, d.fin)
        for d in body.detecciones
        if d.estado == "confirmada" or d.id in minors  # los menores nunca se descartan
    ]
    confirmed_categories = {d.category for d in confirmed}
    replacements = build_replacements(text, confirmed, active=confirmed_categories)
    try:
        original = store.read_original(job_id, record["extension"])
    except FileNotFoundError as error:
        raise HTTPException(status_code=409, detail="El documento original ya no está.") from error
    try:
        if record["extension"] == ".pdf":
            exported = export_pdf(original, replacements)
        else:
            exported = export_docx(original, replacements)
    except (LeakError, UnsupportedDocumentError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    store.discard_content(job_id, "exportado")
    name = f"anonimizado{record['extension']}"
    return Response(
        exported,
        media_type=MEDIA_TYPES[record["extension"]],
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )

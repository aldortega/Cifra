import pymupdf

from app.anonymizer.export_docx import (
    UnsupportedDocumentError,
    check_docx_supported,
    docx_text,
)

MAX_PAGES = 20
MAX_CHARS = 50_000
EXTENSIONS = (".pdf", ".docx")


class RejectedDocumentError(Exception):
    """El documento no cumple los requisitos de la v1; el mensaje es apto para el usuario."""


def extension_of(filename: str) -> str:
    lowered = filename.lower()
    for extension in EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    raise RejectedDocumentError("Solo se aceptan documentos PDF con texto o DOCX.")


def extract_text(data: bytes, extension: str) -> str:
    """Texto del documento, validando los límites de la v1. Falla con RejectedDocumentError."""
    try:
        text = _pdf_text(data) if extension == ".pdf" else _docx_text(data)
    except RejectedDocumentError:
        raise
    except Exception as error:
        raise RejectedDocumentError("No se pudo leer el documento: ¿está dañado?") from error
    if len(text) > MAX_CHARS:
        raise RejectedDocumentError(
            f"El documento supera el límite de {MAX_CHARS} caracteres ({len(text)})."
        )
    return text


def _pdf_text(data: bytes) -> str:
    with pymupdf.open(stream=data) as doc:
        if doc.page_count > MAX_PAGES:
            raise RejectedDocumentError(f"El documento supera el límite de {MAX_PAGES} páginas.")
        text = "\n\n".join(page.get_text() for page in doc)
    if not text.strip():
        raise RejectedDocumentError(
            "El PDF parece escaneado (no tiene texto). Los PDFs escaneados no están soportados."
        )
    return text


def _docx_text(data: bytes) -> str:
    try:
        check_docx_supported(data)
    except UnsupportedDocumentError as error:
        raise RejectedDocumentError(str(error)) from error
    return docx_text(data)

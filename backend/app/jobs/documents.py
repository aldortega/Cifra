from typing import Any, NamedTuple

import pymupdf

from app.anonymizer.export_docx import UnsupportedDocumentError, check_docx_supported
from app.jobs.layout_docx import docx_layout
from app.jobs.layout_pdf import pdf_layout

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


class ExtractedDocument(NamedTuple):
    text: str
    # Estructura visual con posiciones sobre `text`, para mostrar el documento en la revisión.
    layout: dict[str, Any]


def extract_document(data: bytes, extension: str) -> ExtractedDocument:
    """Texto y formato del documento, validando los límites de la v1.

    Falla con RejectedDocumentError.
    """
    try:
        text, layout = _pdf(data) if extension == ".pdf" else _docx(data)
    except RejectedDocumentError:
        raise
    except Exception as error:
        raise RejectedDocumentError("No se pudo leer el documento: ¿está dañado?") from error
    if len(text) > MAX_CHARS:
        raise RejectedDocumentError(
            f"El documento supera el límite de {MAX_CHARS} caracteres ({len(text)})."
        )
    return ExtractedDocument(text, layout)


def extract_text(data: bytes, extension: str) -> str:
    """Texto del documento, validando los límites de la v1. Falla con RejectedDocumentError."""
    return extract_document(data, extension).text


def _pdf(data: bytes) -> tuple[str, dict[str, Any]]:
    with pymupdf.open(stream=data) as doc:
        if doc.page_count > MAX_PAGES:
            raise RejectedDocumentError(f"El documento supera el límite de {MAX_PAGES} páginas.")
    text, layout = pdf_layout(data)
    if not text.strip():
        raise RejectedDocumentError(
            "El PDF parece escaneado (no tiene texto). Los PDFs escaneados no están soportados."
        )
    return text, layout


def _docx(data: bytes) -> tuple[str, dict[str, Any]]:
    try:
        check_docx_supported(data)
    except UnsupportedDocumentError as error:
        raise RejectedDocumentError(str(error)) from error
    return docx_layout(data)

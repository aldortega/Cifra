import pymupdf
import pytest

from app.anonymizer.export_docx import LeakError
from app.anonymizer.export_pdf import export_pdf

REPLACEMENTS = {"Juan Pérez": "[PERSONA 1]", "20.123.456": "[DNI 1]"}


def build_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 100), "El actor Juan Pérez, DNI 20.123.456, demanda.")
    doc.set_metadata({"author": "Secretaria de Juan Pérez", "title": "Expte Juan Pérez"})
    return doc.tobytes()


def text_of(data: bytes) -> str:
    return "".join(page.get_text() for page in pymupdf.open(stream=data))


def test_removes_original_text_and_writes_markers() -> None:
    out = text_of(export_pdf(build_pdf(), REPLACEMENTS))
    assert "Juan Pérez" not in out
    assert "20.123.456" not in out
    assert "[PERSONA 1]" in out
    assert "[DNI 1]" in out


def test_clears_metadata() -> None:
    doc = pymupdf.open(stream=export_pdf(build_pdf(), REPLACEMENTS))
    assert not doc.metadata.get("author")
    assert not doc.metadata.get("title")


def test_fails_when_a_confirmed_value_remains() -> None:
    # El marcador contiene el valor original, así que el texto exportado lo conserva.
    with pytest.raises(LeakError):
        export_pdf(build_pdf(), {"Juan Pérez": "Juan Pérez (oculto)"})

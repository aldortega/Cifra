import pymupdf
import pytest

from app.anonymizer.export_pdf import export_pdf
from app.anonymizer.leak import LeakError, assert_no_leak

REPLACEMENTS = {"Juan Pérez": "[PERSONA 1]", "20.123.456": "[DNI 1]"}


def build_pdf(lines: list[str] | None = None) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    for i, line in enumerate(lines or ["El actor Juan Pérez, DNI 20.123.456, demanda."]):
        page.insert_text((72, 100 + 20 * i), line)
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


def test_marker_longer_than_value_still_fits_and_is_written_whole() -> None:
    out = text_of(export_pdf(build_pdf(["Ana vive aquí"]), {"Ana": "[PERSONA 1]"}))
    assert "[PERSONA 1]" in out.replace("\n", "")


def test_clears_metadata() -> None:
    doc = pymupdf.open(stream=export_pdf(build_pdf(), REPLACEMENTS))
    assert not doc.metadata.get("author")
    assert not doc.metadata.get("title")


def test_verification_catches_a_value_split_across_lines() -> None:
    with pytest.raises(LeakError):
        assert_no_leak("el actor Juan\nPérez demanda", {"Juan Pérez": "[PERSONA 1]"})


def test_verification_ignores_words_inside_inserted_markers() -> None:
    assert_no_leak("[PERSONA 1] declaró", {"PERSONA": "[PERSONA 1]"})

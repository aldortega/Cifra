import io

import pytest
from docx import Document
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

from app.anonymizer.export_docx import LeakError, export_docx


def build_docx() -> bytes:
    doc = Document()
    doc.core_properties.author = "Secretaria de Juan Pérez"
    doc.add_paragraph("El actor Juan Pérez, DNI 20.123.456, demanda.")
    table = doc.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "Domicilio de Juan Pérez"
    doc.sections[0].header.paragraphs[0].text = "Expte de Juan Pérez"
    doc.sections[0].footer.paragraphs[0].text = "DNI 20.123.456"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def all_text(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs]
    for t in doc.tables:
        parts += [c.text for r in t.rows for c in r.cells]
    for s in doc.sections:
        parts += [p.text for p in s.header.paragraphs + s.footer.paragraphs]
    return "\n".join(parts)


REPLACEMENTS = {"Juan Pérez": "[PERSONA 1]", "20.123.456": "[DNI 1]"}


def test_replaces_in_body_tables_headers_and_footers() -> None:
    out = all_text(export_docx(build_docx(), REPLACEMENTS))
    assert "Juan Pérez" not in out
    assert "20.123.456" not in out
    assert "[PERSONA 1]" in out
    assert "[DNI 2]" not in out
    assert out.count("[DNI 1]") == 2


def test_clears_metadata() -> None:
    doc = Document(io.BytesIO(export_docx(build_docx(), REPLACEMENTS)))
    assert doc.core_properties.author == ""


def test_fails_when_a_confirmed_value_remains_in_unprocessed_content() -> None:
    doc = Document(io.BytesIO(build_docx()))
    body = doc.element.body
    textbox = parse_xml(
        f'<w:p xmlns:w="{nsdecls("w").split(chr(34))[1]}"><w:r><w:pict><v:shape '
        'xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox><w:txbxContent><w:p><w:r>'
        "<w:t>Oculto: Juan Pérez</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape>"
        "</w:pict></w:r></w:p>"
    )
    body.insert(0, textbox)
    buf = io.BytesIO()
    doc.save(buf)
    with pytest.raises(LeakError):
        export_docx(buf.getvalue(), REPLACEMENTS)

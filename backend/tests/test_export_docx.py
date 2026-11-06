import io
import zipfile

import pytest
from docx import Document
from docx.oxml import parse_xml
from lxml import etree

from app.anonymizer.export_docx import UnsupportedDocumentError, export_docx
from app.anonymizer.leak import LeakError

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
REPLACEMENTS = {"Juan Pérez": "[PERSONA 1]", "20.123.456": "[DNI 1]"}


def save(doc) -> bytes:
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_docx() -> Document:
    doc = Document()
    doc.core_properties.author = "Secretaria de Juan Pérez"
    doc.add_paragraph("El actor Juan Pérez, DNI 20.123.456, demanda.")
    table = doc.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "Domicilio de Juan Pérez"
    nested = table.cell(0, 0).add_table(rows=1, cols=1)
    nested.cell(0, 0).text = "Tabla anidada: Juan Pérez"
    section = doc.sections[0]
    section.header.paragraphs[0].text = "Expte de Juan Pérez"
    section.footer.paragraphs[0].text = "DNI 20.123.456"
    section.different_first_page_header_footer = True
    section.first_page_header.paragraphs[0].text = "Primera página: Juan Pérez"
    return doc


def with_part(data: bytes, name: str, content: bytes, rel_type: str | None = None) -> bytes:
    """Agrega una parte (p. ej. notas al pie) al paquete OOXML."""
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as dst:
        for item in src.infolist():
            payload = src.read(item.filename)
            if rel_type and item.filename == "[Content_Types].xml":
                payload = payload.replace(
                    b"</Types>",
                    (
                        f'<Override PartName="/{name}" ContentType="application/xml"/></Types>'
                    ).encode(),
                )
            if rel_type and item.filename == "word/_rels/document.xml.rels":
                payload = payload.replace(
                    b"</Relationships>",
                    f'<Relationship Id="rIdX" Type="{rel_type}" Target="{name[5:]}"/>'
                    "</Relationships>".encode(),
                )
            dst.writestr(item, payload)
        dst.writestr(name, content)
    return out.getvalue()


def paragraphs_text(data: bytes) -> list[str]:
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if name.startswith("word/") and name.endswith(".xml"):
                root = etree.fromstring(z.read(name))
                out += [
                    "".join(t.text or "" for t in p.iter(f"{{{W}}}t"))
                    for p in root.iter(f"{{{W}}}p")
                ]
    return out


def test_replaces_everywhere_including_nested_tables_and_first_page_header() -> None:
    texts = "\n".join(paragraphs_text(export_docx(save(build_docx()), REPLACEMENTS)))
    assert "Juan Pérez" not in texts
    assert "20.123.456" not in texts
    assert "Tabla anidada: [PERSONA 1]" in texts
    assert "Primera página: [PERSONA 1]" in texts
    assert texts.count("[DNI 1]") == 2


def test_replaces_in_footnotes() -> None:
    notes = (
        f'<w:footnotes xmlns:w="{W}"><w:footnote w:id="1"><w:p><w:r><w:t>Nota de Juan Pérez</w:t>'
        "</w:r></w:p></w:footnote></w:footnotes>"
    ).encode()
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes"
    data = with_part(save(build_docx()), "word/footnotes.xml", notes, rel)
    texts = "\n".join(paragraphs_text(export_docx(data, REPLACEMENTS)))
    assert "Nota de [PERSONA 1]" in texts


def test_matches_whole_words_only() -> None:
    doc = Document()
    doc.add_paragraph("Expte 12 y 123, asma y asmático")
    out = "\n".join(paragraphs_text(export_docx(save(doc), {"12": "[X 1]", "asma": "[S 1]"})))
    assert "Expte [X 1] y 123, [S 1] y asmático" in out


def test_does_not_replace_inside_markers_already_inserted() -> None:
    doc = Document()
    doc.add_paragraph("Ana Paz y PERSONA")
    out = "\n".join(
        paragraphs_text(export_docx(save(doc), {"Ana Paz": "[PERSONA 1]", "PERSONA": "[Z 1]"}))
    )
    assert "[PERSONA 1] y [Z 1]" in out


def test_clears_core_app_and_custom_metadata() -> None:
    data = save(build_docx())
    out = Document(io.BytesIO(export_docx(data, REPLACEMENTS)))
    assert out.core_properties.author == ""
    with zipfile.ZipFile(io.BytesIO(export_docx(data, REPLACEMENTS))) as z:
        app = z.read("docProps/app.xml").decode()
    assert "<Company>" not in app or "<Company></Company>" in app or "<Company/>" in app


def test_rejects_tracked_changes() -> None:
    doc = build_docx()
    ins = parse_xml(
        f'<w:ins xmlns:w="{W}" w:id="9" w:author="x"><w:r><w:t>texto</w:t></w:r></w:ins>'
    )
    doc.paragraphs[0]._p.append(ins)
    with pytest.raises(UnsupportedDocumentError, match="control de cambios"):
        export_docx(save(doc), REPLACEMENTS)


def test_rejects_comments() -> None:
    data = with_part(
        save(build_docx()), "word/comments.xml", f'<w:comments xmlns:w="{W}"/>'.encode()
    )
    with pytest.raises(UnsupportedDocumentError, match="comentarios"):
        export_docx(data, REPLACEMENTS)


def test_fails_when_a_value_survives_in_an_attribute() -> None:
    doc = build_docx()
    alt = parse_xml(
        f'<w:r xmlns:w="{W}"><w:drawing><docPr xmlns="urn:x" id="1" name="img" descr="Juan Pérez"/>'
        "</w:drawing></w:r>"
    )
    doc.paragraphs[0]._p.append(alt)
    with pytest.raises(LeakError):
        export_docx(save(doc), REPLACEMENTS)

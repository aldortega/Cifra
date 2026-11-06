import io
from pathlib import Path

import pymupdf
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

from app.anonymizer.convert import anonymized_blocks, layout_to_docx, layout_to_pdf
from app.jobs.layout_docx import docx_layout
from app.jobs.layout_pdf import pdf_layout
from tests.helpers import docx_with_footnotes_and_page_field

FIXTURE = Path(__file__).parent / "fixtures" / "sentencia_ejemplo.docx"
REPLACEMENTS = {"Juan Pérez": "[PERSONA 1]", "20.123.456": "[DNI 1]"}


def styled_docx() -> bytes:
    doc = Document()
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("SENTENCIA")
    run.bold = True
    run.font.size = Pt(16)
    body = doc.add_paragraph()
    body.add_run("El actor ")
    body.add_run("Juan").italic = True
    body.add_run(" Pérez, DNI 20.123.456, demanda.")
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Actor"
    table.cell(0, 1).text = "Juan Pérez"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def two_line_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 100), "SENTENCIA", fontname="Times-Bold", fontsize=14)
    page.insert_text((72, 140), "El actor Juan", fontname="Times-Roman")
    page.insert_text((72, 154), "Pérez, DNI 20.123.456, demanda.", fontname="Times-Roman")
    doc.new_page().insert_text((72, 100), "Segunda página de Juan Pérez.")
    return doc.tobytes()


def block_text(block: dict) -> str:
    return "".join(text for text, _style in block["runs"])


def test_markers_replace_values_split_across_styles_and_lines() -> None:
    text, layout = docx_layout(styled_docx())
    blocks = anonymized_blocks(text, layout, REPLACEMENTS)
    texts = [block_text(b) for b in blocks]
    assert "El actor [PERSONA 1], DNI [DNI 1], demanda." in texts
    assert not any("Juan" in t or "20.123" in t for t in texts)

    text, layout = pdf_layout(two_line_pdf())
    blocks = anonymized_blocks(text, layout, REPLACEMENTS)
    joined = " ".join(block_text(b) for b in blocks)
    assert "Juan" not in joined and "Pérez" not in joined
    assert joined.count("[PERSONA 1]") == 2


def test_docx_to_pdf_keeps_text_and_hides_values() -> None:
    text, layout = docx_layout(styled_docx())
    out = layout_to_pdf(text, layout, REPLACEMENTS)
    with pymupdf.open(stream=out) as doc:
        content = " ".join(page.get_text() for page in doc)
        assert doc.metadata.get("author") in (None, "")
    assert "SENTENCIA" in content
    assert "[PERSONA 1]" in content.replace("\n", " ")
    assert "Juan" not in content and "20.123.456" not in content


def test_docx_fixture_converts_to_pdf() -> None:
    text, layout = docx_layout(FIXTURE.read_bytes())
    out = layout_to_pdf(text, layout, {"Martín Alejandro Benítez": "[PERSONA 1]"})
    with pymupdf.open(stream=out) as doc:
        content = " ".join(page.get_text() for page in doc)
    assert "Benítez" not in content
    assert "PODER JUDICIAL" in content


def test_pdf_to_docx_rebuilds_paragraphs_and_hides_values() -> None:
    text, layout = pdf_layout(two_line_pdf())
    out = layout_to_docx(text, layout, REPLACEMENTS)
    doc = Document(io.BytesIO(out))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    assert paragraphs[0] == "SENTENCIA"
    assert doc.paragraphs[0].runs[0].bold
    # Las dos líneas del párrafo se unen en uno solo.
    assert "El actor [PERSONA 1], DNI [DNI 1], demanda." in paragraphs
    assert "Segunda página de [PERSONA 1]." in paragraphs
    assert not doc.core_properties.author


def docx_with_header_and_footer() -> bytes:
    doc = Document()
    doc.sections[0].header.paragraphs[0].text = "Expte. 123 - Juan Pérez"
    doc.sections[0].footer.paragraphs[0].text = "Secretaría: Dra. Ortiz"
    for i in range(80):
        doc.add_paragraph(f"Párrafo {i} del cuerpo de la sentencia.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_header_and_footer_repeat_on_every_page_inside_the_margins() -> None:
    text, layout = docx_layout(docx_with_header_and_footer())
    out = layout_to_pdf(text, layout, REPLACEMENTS)
    page_fmt = layout["pagina"]
    with pymupdf.open(stream=out) as doc:
        assert doc.page_count >= 2
        for page in doc:
            header = page.search_for("Expte. 123")
            footer = page.search_for("Secretaría")
            assert header and header[0].y1 <= page_fmt["margenSuperior"]
            assert footer and footer[0].y0 >= page.rect.height - page_fmt["margenInferior"]
            # Ni el encabezado ni el pie se mezclan con el cuerpo.
            body = [b for b in page.get_text("blocks") if "Párrafo" in b[4]]
            assert all(header[0].y1 < b[1] and b[3] < footer[0].y0 for b in body)
            assert "[PERSONA 1]" in page.get_text()


def test_page_numbers_and_footnotes_on_the_page_that_cites_them() -> None:
    filler = [f"Párrafo {i} del cuerpo de la sentencia." for i in range(70)]
    body = ["El actor Juan Pérez[^1] demanda.", *filler, "Segunda cita[^2] aquí."]
    data = docx_with_footnotes_and_page_field(
        body, {1: "Carta documento de Juan Pérez.", 2: "Ver fs. 12."}
    )
    text, layout = docx_layout(data)
    out = layout_to_pdf(text, layout, REPLACEMENTS)
    with pymupdf.open(stream=out) as doc:
        total = doc.page_count
        assert total >= 2
        pages = [page.get_text() for page in doc]
        for number, content in enumerate(pages, start=1):
            assert f"Pág. {number} de {total}" in content
        first, last = pages[0], pages[-1]
        # Nota 1 al pie de la primera página, nota 2 al pie de la última.
        assert "Carta documento de [PERSONA 1]." in first
        assert "Ver fs. 12." in last and "Ver fs. 12." not in first
        assert "Juan Pérez" not in "".join(pages)
        # La nota queda debajo del texto y encima del pie.
        page = doc[0]
        note = page.search_for("Carta documento")[0]
        footer = page.search_for("Pág. 1")[0]
        text_blocks = [b for b in page.get_text("blocks") if "Párrafo" in b[4]]
        assert all(b[3] < note.y0 for b in text_blocks)
        assert note.y1 < footer.y0

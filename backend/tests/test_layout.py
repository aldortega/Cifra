import io
from pathlib import Path

import pymupdf
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

from app.anonymizer.export_docx import docx_text
from app.jobs.layout_docx import docx_layout
from app.jobs.layout_pdf import pdf_layout
from tests.helpers import docx_with_footnotes_and_page_field

FIXTURE = Path(__file__).parent / "fixtures" / "sentencia_ejemplo.docx"


def covered(text: str, ranges: list[dict]) -> str:
    return "".join(text[r["inicio"] : r["fin"]] for r in ranges)


# --- PDF ---------------------------------------------------------------------------------


def two_page_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 100), "Juzgado Civil N° 2", fontname="Times-Bold", fontsize=14)
    page.insert_text((72, 130), "El actor Juan Pérez demanda.", fontname="Times-Roman")
    title = "SENTENCIA"
    width = pymupdf.get_text_length(title, "helv", 11)
    page.insert_text(((595 - width) / 2, 200), title)
    doc.new_page(width=595, height=842).insert_text((90, 100), "Segunda página.")
    return doc.tobytes()


def test_pdf_text_matches_plain_extraction() -> None:
    data = two_page_pdf()
    text, _ = pdf_layout(data)
    with pymupdf.open(stream=data) as doc:
        assert text == "\n\n".join(page.get_text() for page in doc)


def test_pdf_lines_carry_page_and_position() -> None:
    text, fmt = pdf_layout(two_page_pdf())
    assert fmt["tipo"] == "pdf"
    assert fmt["paginas"] == [{"ancho": 595, "alto": 842}, {"ancho": 595, "alto": 842}]
    by_text = {text[ln["inicio"] : ln["fin"]]: ln for ln in fmt["lineas"]}
    assert by_text["Segunda página."]["pagina"] == 1
    assert round(by_text["Segunda página."]["x0"]) == 90
    assert by_text["El actor Juan Pérez demanda."]["alineacion"] == "izquierda"
    assert by_text["SENTENCIA"]["alineacion"] == "centro"


def test_pdf_styles_cover_every_line_with_font_data() -> None:
    text, fmt = pdf_layout(two_page_pdf())
    assert covered(text, fmt["estilos"]) == covered(text, fmt["lineas"])
    first = fmt["estilos"][0]
    assert text[first["inicio"] : first["fin"]] == "Juzgado Civil N° 2"
    assert first["negrita"] is True
    assert first["tamano"] == 14
    assert first["familia"] == "serif"


# --- DOCX --------------------------------------------------------------------------------


def styled_docx() -> bytes:
    doc = Document()
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("SENTENCIA")
    run.bold = True
    run.font.size = Pt(16)
    doc.add_paragraph("")  # párrafo vacío: no está en el texto, suma espacio
    body = doc.add_paragraph()
    body.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    body.paragraph_format.first_line_indent = Pt(36)
    body.add_run("El actor ")
    italic = body.add_run("Juan Pérez")
    italic.italic = True
    body.add_run(" demanda.")
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "DNI"
    table.cell(0, 1).text = "20.123.456"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_docx_text_matches_plain_extraction() -> None:
    for data in (styled_docx(), FIXTURE.read_bytes()):
        text, _ = docx_layout(data)
        assert text == docx_text(data)


def test_docx_paragraph_properties() -> None:
    text, fmt = docx_layout(styled_docx())
    assert fmt["tipo"] == "docx"
    assert fmt["pagina"]["ancho"] > 0
    by_text = {text[p["inicio"] : p["fin"]]: p for p in fmt["parrafos"]}
    assert by_text["SENTENCIA"]["alineacion"] == "centro"
    body = by_text["El actor Juan Pérez demanda."]
    assert body["alineacion"] == "justificado"
    assert body["primeraLinea"] == 36
    assert body["espacioAntes"] > by_text["SENTENCIA"]["espacioAntes"]
    assert by_text["SENTENCIA"]["seccion"] == "cuerpo"


def test_docx_table_cells() -> None:
    text, fmt = docx_layout(styled_docx())
    by_text = {text[p["inicio"] : p["fin"]]: p for p in fmt["parrafos"]}
    assert by_text["DNI"]["celda"] == {"tabla": 0, "fila": 0, "columna": 0}
    assert by_text["20.123.456"]["celda"] == {"tabla": 0, "fila": 0, "columna": 1}
    assert by_text["SENTENCIA"]["celda"] is None


def test_docx_run_styles() -> None:
    text, fmt = docx_layout(styled_docx())
    styles = {text[s["inicio"] : s["fin"]]: s for s in fmt["estilos"]}
    assert styles["SENTENCIA"]["negrita"] is True
    assert styles["SENTENCIA"]["tamano"] == 16
    assert styles["Juan Pérez"]["cursiva"] is True
    assert styles["El actor "]["cursiva"] is False
    assert covered(text, fmt["estilos"]) == covered(text, fmt["parrafos"])


def test_docx_fixture_has_layout_for_every_paragraph() -> None:
    text, fmt = docx_layout(FIXTURE.read_bytes())
    assert covered(text, fmt["parrafos"]) == text.replace("\n", "")


def test_docx_page_fields_and_footnotes() -> None:
    data = docx_with_footnotes_and_page_field(
        ["El actor Juan Pérez[^1] demanda.", "Segundo párrafo[^2]."],
        {1: "Carta documento.", 2: "Ver fs. 12."},
    )
    text, fmt = docx_layout(data)
    assert text == docx_text(data)
    # El pie "Pág. <PAGE> de <NUMPAGES>" lleva los dos campos, sin texto propio.
    pie = next(p for p in fmt["parrafos"] if p["seccion"] == "pie")
    assert text[pie["inicio"] : pie["fin"]] == "Pág.  de "
    assert [(c["tipo"], c["inicio"] - pie["inicio"]) for c in fmt["campos"]] == [
        ("pagina", 5),
        ("paginas", 9),
    ]
    # Cada llamada sabe su número y dónde va; cada nota, a qué número pertenece.
    refs = [(text[: r["posicion"]].split("\n")[-1], r["numero"]) for r in fmt["referencias"]]
    assert refs == [("El actor Juan Pérez", 1), ("Segundo párrafo", 2)]
    notes = [
        (text[p["inicio"] : p["fin"]].strip(), p["nota"])
        for p in fmt["parrafos"]
        if p["seccion"] == "notas"
    ]
    assert notes == [
        ("Carta documento.", {"tipo": "nota", "numero": 1, "primero": True}),
        ("Ver fs. 12.", {"tipo": "nota", "numero": 2, "primero": True}),
    ]

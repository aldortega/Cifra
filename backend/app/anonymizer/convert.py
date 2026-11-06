"""Exportación a un formato distinto del original (DOCX → PDF y PDF → DOCX).

No se toca el archivo original: el documento nuevo se arma con el texto ya anonimizado y el
formato extraído al procesar (`app.jobs.layout_*`). Al final pasa por la exportación habitual
del formato destino, que limpia metadatos y verifica que no quede ningún valor confirmado.
"""

import html
import io
import re
from typing import Any

import pymupdf
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.shared import Pt

from app.anonymizer.export_docx import export_docx
from app.anonymizer.export_pdf import export_pdf
from app.anonymizer.replacement import value_pattern

Style = dict[str, Any] | None
Run = tuple[str, Style]

# Una línea de PDF continúa el párrafo anterior si el hueco vertical es menor a esta
# fracción de su alto y no está centrada ni alineada a la derecha.
SAME_PARAGRAPH_GAP = 0.6
EDGE_TOLERANCE = 8.0


PAGE_TOKEN, PAGES_TOKEN = "\ue000", "\ue001"
REF_OPEN, REF_CLOSE = "\ue002", "\ue003"
REF_PATTERN = re.compile(f"{REF_OPEN}(nota|final):(\\d+){REF_CLOSE}")


def _roman(n: int) -> str:
    out = ""
    for value, digits in ((10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while n >= value:
            out, n = out + digits, n - value
    return out


def note_label(kind: str, number: int) -> str:
    """Notas al pie con números arábigos y notas finales con romanos, como Word por defecto."""
    return str(number) if kind == "nota" else _roman(number)


def _intervals(text: str, replacements: dict[str, str]) -> list[tuple[int, int, str]]:
    """Apariciones de cada valor en el texto, con el mismo criterio que `replace_all`."""
    values = sorted((v for v in replacements if v.strip()), key=len, reverse=True)
    if not values:
        return []
    pattern = re.compile("|".join(f"(?:{value_pattern(v)})" for v in values))
    lookup = {re.sub(r"\s+", " ", v): marker for v, marker in replacements.items()}
    return [
        (m.start(), m.end(), lookup[re.sub(r"\s+", " ", m.group(0))])
        for m in pattern.finditer(text)
    ]


def _style_pieces(start: int, end: int, styles: list[dict]) -> list[tuple[int, int, Style]]:
    """Tramos de [start, end) con su estilo, sin huecos."""
    pieces: list[tuple[int, int, Style]] = []
    pos = start
    for style in styles:
        if style["fin"] <= start or style["inicio"] >= end:
            continue
        s0, s1 = max(start, style["inicio"]), min(end, style["fin"])
        if s0 > pos:
            pieces.append((pos, s0, None))
        pieces.append((s0, s1, style))
        pos = s1
    if pos < end:
        pieces.append((pos, end, None))
    return pieces


def _runs(
    text: str, start: int, end: int, styles: list[dict], intervals: list[tuple[int, int, str]]
) -> list[Run]:
    """Texto anonimizado de un bloque: cada valor se cambia por su marcador, con el estilo del
    lugar donde empieza. Un valor que sigue en otro bloque (p. ej. otra línea) solo deja el
    marcador en el primero."""
    nearby = [iv for iv in intervals if iv[0] <= end and iv[1] >= start]
    out: list[Run] = []
    for s0, s1, style in _style_pieces(start, end, styles):
        pos = s0
        for i0, i1, marker in nearby:
            if i0 == i1:  # inserción (campo o llamada a nota): va en el tramo que la contiene
                if not (s0 <= i0 < s1 or i0 == s1 == end):
                    continue
            elif i1 <= s0 or i0 >= s1:
                continue
            if i0 > pos:
                out.append((text[pos:i0], style))
            if s0 <= i0:
                out.append((marker, style))
            pos = max(pos, min(i1, s1))
        if pos < s1:
            out.append((text[pos:s1], style))
    merged: list[Run] = []
    for chunk, style in out:
        if merged and merged[-1][1] is style:
            merged[-1] = (merged[-1][0] + chunk, style)
        elif chunk:
            merged.append((chunk, style))
    return merged


def anonymized_blocks(
    text: str, layout: dict[str, Any], replacements: dict[str, str]
) -> list[dict[str, Any]]:
    """Párrafos (DOCX) o líneas (PDF) del formato, cada uno con sus tramos ya anonimizados."""
    intervals = _intervals(text, replacements)
    # Campos de página y llamadas a notas viajan como fichas que se resuelven al maquetar.
    marks = [
        (f["inicio"], f["fin"], PAGE_TOKEN if f["tipo"] == "pagina" else PAGES_TOKEN)
        for f in layout.get("campos", [])
    ] + [
        (r["posicion"], r["posicion"], f"{REF_OPEN}{r['tipo']}:{r['numero']}{REF_CLOSE}")
        for r in layout.get("referencias", [])
    ]
    every = sorted(intervals + marks, key=lambda iv: (iv[0], iv[1]))
    styles = layout["estilos"]
    blocks = layout["parrafos"] if layout["tipo"] == "docx" else layout["lineas"]
    return [
        {
            **block,
            "runs": _runs(text, block["inicio"], block["fin"], styles, every),
            # Un valor reemplazado sigue en el bloque siguiente (p. ej. cortado entre líneas).
            "sigue": any(i0 < block["fin"] < i1 for i0, i1, _ in intervals),
        }
        for block in blocks
    ]


# --- DOCX → PDF -----------------------------------------------------------------------------

CSS_ALIGN = {"izquierda": "left", "centro": "center", "derecha": "right", "justificado": "justify"}
CSS_FAMILY = {"serif": "serif", "sans": "sans-serif", "mono": "monospace"}


def _html_runs(runs: list[Run]) -> str:
    out = []
    for chunk, style in runs:
        escaped = html.escape(chunk)
        if style is None:
            out.append(escaped)
            continue
        css = [
            f"font-family: {CSS_FAMILY[style['familia']]}",
            f"font-size: {style['tamano']}pt",
        ]
        if style["negrita"]:
            css.append("font-weight: bold")
        if style["cursiva"]:
            css.append("font-style: italic")
        if style["subrayado"]:
            css.append("text-decoration: underline")
        out.append(f'<span style="{"; ".join(css)}">{escaped}</span>')
    return REF_PATTERN.sub(
        lambda m: f'<sup id="ref-{m[1]}-{m[2]}">{note_label(m[1], int(m[2]))}</sup>', "".join(out)
    )


def _html_paragraph(block: dict[str, Any], in_cell: bool = False) -> str:
    before = min(block["espacioAntes"], 4) if in_cell else block["espacioAntes"]
    css = "; ".join(
        [
            f"text-align: {CSS_ALIGN[block['alineacion']]}",
            f"margin: {before}pt {block['sangriaDerecha']}pt 0 {block['sangria']}pt",
            f"text-indent: {block['primeraLinea']}pt",
            f"line-height: {block['interlineado']}",
        ]
    )
    note = block.get("nota")
    mark = (
        f"<sup>{note_label(note['tipo'], note['numero'])}</sup>" if note and note["primero"] else ""
    )
    return f'<p style="{css}">{mark}{_html_runs(block["runs"])}</p>'


def _html_table(blocks: list[dict[str, Any]]) -> str:
    cells: dict[tuple[int, int], list[str]] = {}
    for b in blocks:
        key = (b["celda"]["fila"], b["celda"]["columna"])
        cells.setdefault(key, []).append(_html_paragraph(b, in_cell=True))
    rows = max(r for r, _ in cells) + 1
    cols = max(c for _, c in cells) + 1
    body = "".join(
        "<tr>"
        + "".join(
            f'<td style="border: 0.5pt solid black; padding: 2pt 4pt">'
            f"{''.join(cells.get((r, c), []))}</td>"
            for c in range(cols)
        )
        + "</tr>"
        for r in range(rows)
    )
    return f'<table style="border-collapse: collapse; width: 100%">{body}</table>'


def _section_html(blocks: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    i = 0
    while i < len(blocks):
        block = blocks[i]
        if block["celda"] is None:
            parts.append(_html_paragraph(block))
            i += 1
            continue
        table = block["celda"]["tabla"]
        j = i
        while j < len(blocks) and blocks[j]["celda"] and blocks[j]["celda"]["tabla"] == table:
            j += 1
        parts.append(_html_table(blocks[i:j]))
        i = j
    return "".join(parts)


NOTE_RULE = '<div style="width: 33%; border-top: 0.5pt solid black; margin-bottom: 4pt"></div>'
NOTE_GAP = 10.0  # pt entre el texto y las notas al pie
# Las notas al pie de una página no ocupan más de esta fracción del área de texto.
MAX_NOTES_SHARE = 0.6


def _body_html(blocks: list[dict[str, Any]]) -> str:
    """Cuerpo seguido de las notas finales (las notas al pie van en cada página)."""
    body = _section_html([b for b in blocks if b["seccion"] == "cuerpo"])
    endnotes = [
        b for b in blocks if b["seccion"] == "notas" and (b.get("nota") or {}).get("tipo") != "nota"
    ]
    if endnotes:
        body += NOTE_RULE.replace(
            "margin-bottom", "margin-top: 18pt; margin-bottom"
        ) + _section_html(endnotes)
    return f"<body>{body}</body>".replace(PAGE_TOKEN, "").replace(PAGES_TOKEN, "")


def _footnotes_html(blocks: list[dict[str, Any]]) -> dict[int, str]:
    notes: dict[int, list[dict[str, Any]]] = {}
    for b in blocks:
        note = b.get("nota")
        if b["seccion"] == "notas" and note and note["tipo"] == "nota":
            notes.setdefault(note["numero"], []).append(b)
    # Sin el espacio entre párrafos del estilo: las notas van compactas bajo la rayita.
    return {n: "".join(_html_paragraph(b, in_cell=True) for b in own) for n, own in notes.items()}


# Distancia (pt) del encabezado y del pie al borde de la hoja: el valor por defecto de Word.
HEADER_DISTANCE = 36.0


def _height(html_body: str, rect: pymupdf.Rect) -> float:
    _, filled = pymupdf.Story(html=f"<body>{html_body}</body>").place(
        pymupdf.Rect(rect.x0, 0, rect.x1, 100_000)
    )
    return pymupdf.Rect(filled).height


def _draw_once(device: Any, html: str, rect: pymupdf.Rect, bottom: bool = False) -> None:
    """Dibuja un fragmento (encabezado, pie o notas) dentro de `rect`; si `bottom`, pegado abajo."""
    if bottom:
        _, filled = pymupdf.Story(html=html).place(rect)
        height = pymupdf.Rect(filled).height
        rect = pymupdf.Rect(rect.x0, max(rect.y0, rect.y1 - height), rect.x1, rect.y1)
    story = pymupdf.Story(html=html)
    story.place(rect)
    story.draw(device)


def _place_pages(html: str, rects: list[pymupdf.Rect], last: pymupdf.Rect) -> tuple[bool, set[int]]:
    """Maqueta desde el principio las páginas ya decididas y prueba `last` como la siguiente.

    Devuelve si queda texto y qué notas al pie se citan en esa página.
    """
    story = pymupdf.Story(html=html)
    for rect in rects:
        story.place(rect)
        story.draw(None)  # sin dibujar no avanza a la página siguiente
    refs: set[int] = set()

    def collect(position: Any) -> None:
        element_id = getattr(position, "id", "") or ""
        if element_id.startswith("ref-nota-"):
            refs.add(int(element_id.rsplit("-", 1)[1]))

    more, _ = story.place(last)
    story.element_positions(collect, {})
    return more, refs


def _paginate(
    html: str, body: pymupdf.Rect, footnotes: dict[int, str]
) -> list[tuple[pymupdf.Rect, list[int]]]:
    """Área de texto de cada página y las notas al pie que van en ella.

    Cada página se achica lo necesario para que sus notas entren debajo; si al achicarla una
    llamada pasa a la página siguiente, su nota se va con ella.
    """
    if not footnotes:
        pages, story, more = [], pymupdf.Story(html=html), True
        while more:
            more, _ = story.place(body)
            story.draw(None)
            pages.append((body, []))
        return pages

    pages: list[tuple[pymupdf.Rect, list[int]]] = []
    more = True
    while more:
        rects = [rect for rect, _ in pages]
        more, refs = _place_pages(html, rects, body)
        rect = body
        cited = sorted(n for n in refs if n in footnotes)
        if cited:
            notes = NOTE_RULE + "".join(footnotes[n] for n in cited)
            room = min(_height(notes, body) + NOTE_GAP, body.height * MAX_NOTES_SHARE)
            rect = pymupdf.Rect(body.x0, body.y0, body.x1, body.y1 - room)
            more, refs = _place_pages(html, rects, rect)
            cited = sorted(n for n in refs if n in footnotes)
        pages.append((rect, cited))
    return pages


def layout_to_pdf(text: str, layout: dict[str, Any], replacements: dict[str, str]) -> bytes:
    """PDF armado a partir de un DOCX ya procesado (texto + formato).

    El encabezado y el pie se repiten en cada página dentro de los márgenes, con el número de
    página resuelto, y cada nota al pie va al final de la página donde se la cita.
    """
    page = layout["pagina"]
    blocks = anonymized_blocks(text, layout, replacements)
    header = _section_html([b for b in blocks if b["seccion"] == "encabezado"])
    footer = _section_html([b for b in blocks if b["seccion"] == "pie"])
    footnotes = _footnotes_html(blocks)
    width, height = page["ancho"], page["alto"]
    left, right = page["margenIzquierdo"], width - page["margenDerecho"]
    top, bottom = page["margenSuperior"], height - page["margenInferior"]
    body = pymupdf.Rect(left, top, right, bottom)
    header_rect = pymupdf.Rect(left, min(HEADER_DISTANCE, top), right, top)
    footer_rect = pymupdf.Rect(left, bottom, right, height - min(HEADER_DISTANCE, height - bottom))

    html = _body_html(blocks)
    pages = _paginate(html, body, footnotes)
    total = str(len(pages))
    story = pymupdf.Story(html=html)
    mediabox = pymupdf.Rect(0, 0, width, height)
    buf = io.BytesIO()
    writer = pymupdf.DocumentWriter(buf)
    for number, (rect, cited) in enumerate(pages, start=1):
        device = writer.begin_page(mediabox)
        story.place(rect)
        story.draw(device)
        if cited:
            notes = NOTE_RULE + "".join(footnotes[n] for n in cited)
            _draw_once(device, f"<body>{notes}</body>", body, bottom=True)
        for part, where, at_bottom in ((header, header_rect, False), (footer, footer_rect, True)):
            if part:
                filled = part.replace(PAGE_TOKEN, str(number)).replace(PAGES_TOKEN, total)
                _draw_once(device, f"<body>{filled}</body>", where, bottom=at_bottom)
        writer.end_page()
    writer.close()
    # Limpia metadatos y verifica que no quede ningún valor.
    return export_pdf(buf.getvalue(), replacements)


# --- PDF → DOCX -----------------------------------------------------------------------------

DOCX_ALIGN = {
    "izquierda": WD_ALIGN_PARAGRAPH.LEFT,
    "centro": WD_ALIGN_PARAGRAPH.CENTER,
    "derecha": WD_ALIGN_PARAGRAPH.RIGHT,
    "justificado": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def _pdf_paragraphs(lines: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Agrupa las líneas consecutivas de un mismo párrafo."""

    def height(line: dict[str, Any]) -> float:
        return line["y1"] - line["y0"]

    groups: list[list[dict[str, Any]]] = []
    for line in lines:
        prev = groups[-1][-1] if groups else None
        continues = (
            prev is not None
            and prev["pagina"] == line["pagina"]
            and line["alineacion"] == prev["alineacion"] == "izquierda"
            # Las cajas de líneas seguidas suelen solaparse un poco: el hueco puede ser negativo.
            and -height(line) / 2 < line["y0"] - prev["y1"] < SAME_PARAGRAPH_GAP * height(line)
        )
        if continues:
            groups[-1].append(line)
        else:
            groups.append([line])
    return groups


def layout_to_docx(text: str, layout: dict[str, Any], replacements: dict[str, str]) -> bytes:
    """DOCX armado a partir de un PDF ya procesado (texto + formato)."""
    lines = anonymized_blocks(text, layout, replacements)
    first = layout["paginas"][0] if layout["paginas"] else {"ancho": 595, "alto": 842}
    left = min((ln["x0"] for ln in lines), default=72.0)
    right_edge = max((ln["x1"] for ln in lines), default=first["ancho"] - 72.0)

    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Pt(first["ancho"]), Pt(first["alto"])
    section.left_margin = Pt(left)
    section.right_margin = Pt(max(first["ancho"] - right_edge, 18))
    top = min((ln["y0"] for ln in lines if ln["pagina"] == 0), default=72.0)
    section.top_margin = section.bottom_margin = Pt(min(top, 72))
    for paragraph in list(doc.paragraphs):
        paragraph._element.getparent().remove(paragraph._element)

    page = 0
    prev_bottom: float | None = None
    for group in _pdf_paragraphs(lines):
        head, rest = group[0], group[1:]
        paragraph = doc.add_paragraph()
        if head["pagina"] != page:
            paragraph.add_run().add_break(WD_BREAK.PAGE)
            page, prev_bottom = head["pagina"], None
        fmt = paragraph.paragraph_format
        fmt.space_after = Pt(0)
        fmt.space_before = Pt(max(0, head["y0"] - prev_bottom) if prev_bottom else 0)
        alignment = head["alineacion"]
        # Un párrafo de varias líneas que llegan al margen derecho estaba justificado.
        if len(group) > 1 and all(right_edge - ln["x1"] < EDGE_TOLERANCE for ln in group[:-1]):
            alignment = "justificado"
        fmt.alignment = DOCX_ALIGN[alignment]
        if alignment in ("izquierda", "justificado"):
            body_x = rest[0]["x0"] if rest else head["x0"]
            fmt.left_indent = Pt(max(0, body_x - left))
            fmt.first_line_indent = Pt(head["x0"] - body_x)
        for n, line in enumerate(group):
            runs = list(line["runs"])
            joins = n < len(group) - 1 and not line["sigue"]
            if joins and runs and not runs[-1][0].endswith((" ", "-")):
                runs[-1] = (runs[-1][0] + " ", runs[-1][1])
            for chunk, style in runs:
                run = paragraph.add_run(chunk)
                if style:
                    run.bold, run.italic = style["negrita"], style["cursiva"]
                    run.font.size = Pt(style["tamano"])
                    run.font.name = style["fuente"]
        prev_bottom = group[-1]["y1"]

    buf = io.BytesIO()
    doc.save(buf)
    # Limpia metadatos (python-docx deja autor y título por defecto) y verifica fugas.
    return export_docx(buf.getvalue(), replacements)

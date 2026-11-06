"""Texto de un DOCX junto con el formato de cada párrafo y el estilo de cada tramo.

Recorre los mismos párrafos que `docx_text` y arma el texto en el mismo recorrido, así que las
posiciones (`inicio`, `fin`) siempre corresponden al texto que se guarda y se analiza. Los
estilos se resuelven con la herencia de `styles.xml` (valores por defecto, `basedOn`, estilo
de párrafo y de carácter, formato directo), sin cubrir casos raros como estilos de tabla.
"""

import io
import zipfile
from typing import Any

from lxml import etree

from app.anonymizer.export_docx import W, _is_content_part, _own_texts, _parse
from app.jobs.layout_pdf import generic_family

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
TWIPS_PER_PT = 20
# Interlineado "sencillo" de Word expresado como line-height de CSS.
SINGLE_LINE_HEIGHT = 1.17
DEFAULT_SIZE = 10.0  # pt: valor de la especificación cuando ningún estilo define `w:sz`
DEFAULT_FONT = "Times New Roman"
A4 = {"w": 11906, "h": 16838, "margin": 1440}
OFF = ("0", "false", "off")
ALIGNMENTS = {
    "center": "centro",
    "right": "derecha",
    "end": "derecha",
    "both": "justificado",
    "distribute": "justificado",
    "justify": "justificado",
}


def _w(tag: str) -> str:
    return f"{{{W}}}{tag}"


def _attr(el: etree._Element | None, name: str) -> str | None:
    return None if el is None else el.get(_w(name))


def _section(part: str) -> str:
    stem = part[5:-4].rstrip("0123456789")
    return {"document": "cuerpo", "header": "encabezado", "footer": "pie"}.get(stem, "notas")


class _Styles:
    def __init__(self, styles: etree._Element | None, theme: etree._Element | None) -> None:
        self.by_id: dict[str, etree._Element] = {}
        self.default_paragraph: str | None = None
        self.default_ppr = self.default_rpr = None
        if styles is not None:
            for style in styles.iter(_w("style")):
                style_id = _attr(style, "styleId")
                if style_id:
                    self.by_id[style_id] = style
                if _attr(style, "type") == "paragraph" and _attr(style, "default") in ("1", "true"):
                    self.default_paragraph = style_id
            self.default_ppr = styles.find(f"{_w('docDefaults')}/{_w('pPrDefault')}/{_w('pPr')}")
            self.default_rpr = styles.find(f"{_w('docDefaults')}/{_w('rPrDefault')}/{_w('rPr')}")
        self.theme_fonts: dict[str, str] = {}
        if theme is not None:
            for kind in ("major", "minor"):
                latin = theme.find(f".//{{{A}}}{kind}Font/{{{A}}}latin")
                if latin is not None and latin.get("typeface"):
                    self.theme_fonts[kind] = latin.get("typeface", "")

    def chain(self, style_id: str | None) -> list[etree._Element]:
        """Estilos desde el más básico hasta `style_id`, siguiendo `basedOn`."""
        out: list[etree._Element] = []
        seen: set[str] = set()
        while style_id and style_id not in seen and style_id in self.by_id:
            seen.add(style_id)
            style = self.by_id[style_id]
            out.append(style)
            style_id = _attr(style.find(_w("basedOn")), "val")
        return out[::-1]


def _merge_ppr(acc: dict[str, Any], ppr: etree._Element | None) -> None:
    if ppr is None:
        return
    if (jc := _attr(ppr.find(_w("jc")), "val")) is not None:
        acc["jc"] = jc
    ind = ppr.find(_w("ind"))
    if ind is not None:
        for key, names in (("left", ("left", "start")), ("right", ("right", "end"))):
            for name in names:
                if (value := _attr(ind, name)) is not None:
                    acc[key] = int(value)
        if (value := _attr(ind, "firstLine")) is not None:
            acc["first"] = int(value)
        if (value := _attr(ind, "hanging")) is not None:
            acc["first"] = -int(value)
    spacing = ppr.find(_w("spacing"))
    if spacing is not None:
        for name in ("before", "after", "line", "lineRule"):
            if (value := _attr(spacing, name)) is not None:
                acc[name] = value


def _merge_rpr(acc: dict[str, Any], rpr: etree._Element | None) -> None:
    if rpr is None:
        return
    for key, tag in (("bold", "b"), ("italic", "i")):
        el = rpr.find(_w(tag))
        if el is not None:
            acc[key] = _attr(el, "val") not in OFF
    underline = rpr.find(_w("u"))
    if underline is not None:
        acc["underline"] = _attr(underline, "val") not in (*OFF, "none")
    if (size := _attr(rpr.find(_w("sz")), "val")) is not None:
        acc["size"] = int(size) / 2
    fonts = rpr.find(_w("rFonts"))
    if fonts is not None:
        name = _attr(fonts, "ascii") or _attr(fonts, "hAnsi")
        theme = _attr(fonts, "asciiTheme") or _attr(fonts, "hAnsiTheme")
        if name:
            acc["font"], acc["theme"] = name, None
        elif theme:
            acc["font"], acc["theme"] = None, "major" if theme.startswith("major") else "minor"


def _page(document: etree._Element | None) -> dict[str, float]:
    sect = None
    if document is not None:
        body = document.find(_w("body"))
        sect = body.find(_w("sectPr")) if body is not None else None
    size = sect.find(_w("pgSz")) if sect is not None else None
    margins = sect.find(_w("pgMar")) if sect is not None else None

    def twips(el: etree._Element | None, name: str, default: int) -> float:
        value = _attr(el, name)
        return round(int(value) / TWIPS_PER_PT if value else default / TWIPS_PER_PT, 2)

    return {
        "ancho": twips(size, "w", A4["w"]),
        "alto": twips(size, "h", A4["h"]),
        "margenIzquierdo": twips(margins, "left", A4["margin"]),
        "margenDerecho": twips(margins, "right", A4["margin"]),
        "margenSuperior": twips(margins, "top", A4["margin"]),
        "margenInferior": twips(margins, "bottom", A4["margin"]),
    }


def _line_height(ppr: dict[str, Any], size: float) -> float:
    line = ppr.get("line")
    if not line:
        return SINGLE_LINE_HEIGHT
    if ppr.get("lineRule", "auto") == "auto":
        return round(int(line) / 240 * SINGLE_LINE_HEIGHT, 3)
    return round(max(int(line) / TWIPS_PER_PT / size, 0.8), 3)


def _cell(paragraph: etree._Element, tables: dict[etree._Element, int]) -> dict[str, int] | None:
    tc = next(paragraph.iterancestors(_w("tc")), None)
    if tc is None:
        return None
    tr = tc.getparent()
    tbl = tr.getparent() if tr is not None else None
    if tr is None or tbl is None:
        return None
    rows = [r for r in tbl if r.tag == _w("tr")]
    cells = [c for c in tr if c.tag == _w("tc")]
    return {
        "tabla": tables.setdefault(tbl, len(tables)),
        "fila": rows.index(tr),
        "columna": cells.index(tc),
    }


def docx_layout(data: bytes) -> tuple[str, dict[str, Any]]:
    """Devuelve el texto (idéntico a `docx_text`) y el formato de párrafos y tramos."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        parts = sorted(n for n in names if _is_content_part(n))
        roots = {n: _parse(z.read(n)) for n in parts}
        styles_root = _parse(z.read("word/styles.xml")) if "word/styles.xml" in names else None
        theme_name = next((n for n in names if n.startswith("word/theme/theme")), None)
        theme_root = _parse(z.read(theme_name)) if theme_name else None

    styles = _Styles(styles_root, theme_root)
    lines: list[str] = []
    offset = 0
    paragraphs: list[dict[str, Any]] = []
    spans: list[dict[str, Any]] = []
    tables: dict[etree._Element, int] = {}

    for part in parts:
        pending_space = 0.0  # pt de párrafos vacíos y espacio posterior del párrafo anterior
        for paragraph in roots[part].iter(_w("p")):
            direct_ppr = paragraph.find(_w("pPr"))
            style_id = (
                _attr(direct_ppr.find(_w("pStyle")) if direct_ppr is not None else None, "val")
                or styles.default_paragraph
            )
            chain = styles.chain(style_id)

            ppr: dict[str, Any] = {}
            _merge_ppr(ppr, styles.default_ppr)
            for style in chain:
                _merge_ppr(ppr, style.find(_w("pPr")))
            _merge_ppr(ppr, direct_ppr)

            base_rpr: dict[str, Any] = {}
            _merge_rpr(base_rpr, styles.default_rpr)
            for style in chain:
                _merge_rpr(base_rpr, style.find(_w("rPr")))
            base_size = base_rpr.get("size", DEFAULT_SIZE)

            texts = _own_texts(paragraph)
            text = "".join(t.text or "" for t in texts)
            before = int(ppr.get("before", 0)) / TWIPS_PER_PT
            after = int(ppr.get("after", 0)) / TWIPS_PER_PT
            if not text.strip():
                pending_space += before + base_size * _line_height(ppr, base_size) + after
                continue

            if lines:
                offset += 1  # el "\n" que separa párrafos en el texto
            start = offset
            for t in texts:
                if not t.text:
                    continue
                run = next(t.iterancestors(_w("r")), None)
                rpr = run.find(_w("rPr")) if run is not None else None
                acc = dict(base_rpr)
                char_style = _attr(rpr.find(_w("rStyle")) if rpr is not None else None, "val")
                for style in styles.chain(char_style):
                    _merge_rpr(acc, style.find(_w("rPr")))
                _merge_rpr(acc, rpr)
                font = acc.get("font") or styles.theme_fonts.get(acc.get("theme") or "minor")
                font = font or DEFAULT_FONT
                span = {
                    "inicio": offset,
                    "fin": offset + len(t.text),
                    "negrita": bool(acc.get("bold")),
                    "cursiva": bool(acc.get("italic")),
                    "subrayado": bool(acc.get("underline")),
                    "tamano": acc.get("size", DEFAULT_SIZE),
                    "fuente": font,
                    "familia": generic_family(font, 0 if "sans" in font.lower() else 4),
                }
                offset += len(t.text)
                last = spans[-1] if spans else None
                if (
                    last
                    and last["fin"] == span["inicio"]
                    and all(last[k] == span[k] for k in span if k not in ("inicio", "fin"))
                ):
                    last["fin"] = span["fin"]
                else:
                    spans.append(span)
            lines.append(text)
            paragraphs.append(
                {
                    "inicio": start,
                    "fin": offset,
                    "seccion": _section(part),
                    "alineacion": ALIGNMENTS.get(ppr.get("jc", ""), "izquierda"),
                    "sangria": round(ppr.get("left", 0) / TWIPS_PER_PT, 2),
                    "sangriaDerecha": round(ppr.get("right", 0) / TWIPS_PER_PT, 2),
                    "primeraLinea": round(ppr.get("first", 0) / TWIPS_PER_PT, 2),
                    "espacioAntes": round(pending_space + before, 2),
                    "interlineado": _line_height(ppr, base_size),
                    "celda": _cell(paragraph, tables),
                }
            )
            pending_space = after

    page = _page(roots.get("word/document.xml"))
    return "\n".join(lines), {
        "tipo": "docx",
        "pagina": page,
        "parrafos": paragraphs,
        "estilos": spans,
    }

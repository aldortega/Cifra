"""Texto de un PDF junto con la posición de cada línea y el estilo de cada tramo.

El texto se arma en el mismo recorrido que la estructura, así que las posiciones (`inicio`,
`fin`) de líneas y estilos son siempre válidas para el texto que se guarda y se analiza.
"""

import re
from typing import Any

import pymupdf

PAGE_SEPARATOR = "\n\n"
BOLD, ITALIC, SERIF, MONO = 16, 2, 4, 8
# Tolerancia (pt) para considerar una línea centrada o alineada al margen derecho.
ALIGN_TOLERANCE = 6.0
# Sangría mínima (pt) respecto del margen para que una línea simétrica cuente como centrada.
MIN_CENTER_INDENT = 18.0

SANS_HINTS = ("arial", "helvetica", "helv", "calibri", "verdana", "tahoma", "segoe", "sans")
MONO_HINTS = ("courier", "mono", "consolas")


def font_family(name: str) -> str:
    """Familia sin prefijo de subconjunto ni variante (p. ej. `ABCDEF+Arial-BoldMT` → Arial)."""
    name = name.split("+", 1)[-1]
    name = re.split(r"[-,]", name, maxsplit=1)[0]
    return re.sub(r"(PSMT|MT|PS)$", "", name) or "Times"


def generic_family(name: str, flags: int = 0) -> str:
    lowered = name.lower()
    if flags & MONO or any(h in lowered for h in MONO_HINTS):
        return "mono"
    if any(h in lowered for h in SANS_HINTS):
        return "sans"
    if flags & SERIF or "times" in lowered or "roman" in lowered:
        return "serif"
    return "sans"


def _alignment(x0: float, x1: float, width: float, left_margin: float, right_edge: float) -> str:
    if abs(x0 - (width - x1)) <= ALIGN_TOLERANCE and x0 - left_margin >= MIN_CENTER_INDENT:
        return "centro"
    if abs(x1 - right_edge) <= ALIGN_TOLERANCE and x0 - left_margin > width * 0.3:
        return "derecha"
    return "izquierda"


def pdf_layout(data: bytes) -> tuple[str, dict[str, Any]]:
    """Devuelve el texto (idéntico a unir `page.get_text()` de cada página) y su formato."""
    parts: list[str] = []
    offset = 0
    pages: list[dict[str, float]] = []
    lines: list[dict[str, Any]] = []
    styles: list[dict[str, Any]] = []

    def add(chunk: str) -> int:
        nonlocal offset
        start = offset
        parts.append(chunk)
        offset += len(chunk)
        return start

    with pymupdf.open(stream=data) as doc:
        for number, page in enumerate(doc):
            if number:
                add(PAGE_SEPARATOR)
            width, height = page.rect.width, page.rect.height
            pages.append({"ancho": round(width, 2), "alto": round(height, 2)})
            raw = [
                line
                for block in page.get_text("dict")["blocks"]
                if block["type"] == 0
                for line in block["lines"]
            ]
            boxes = [line["bbox"] for line in raw]
            left_margin = min((b[0] for b in boxes), default=0.0)
            right_edge = max((b[2] for b in boxes), default=width)
            for line in raw:
                x0, y0, x1, y1 = line["bbox"]
                start = offset
                for span in line["spans"]:
                    if not span["text"]:
                        continue
                    span_start = add(span["text"])
                    flags = span["flags"]
                    styles.append(
                        {
                            "inicio": span_start,
                            "fin": offset,
                            "negrita": bool(flags & BOLD) or "bold" in span["font"].lower(),
                            "cursiva": bool(flags & ITALIC),
                            "subrayado": False,
                            "tamano": round(span["size"], 2),
                            "fuente": font_family(span["font"]),
                            "familia": generic_family(span["font"], flags),
                        }
                    )
                if offset > start:
                    lines.append(
                        {
                            "inicio": start,
                            "fin": offset,
                            "pagina": number,
                            "x0": round(x0, 2),
                            "y0": round(y0, 2),
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "alineacion": _alignment(x0, x1, width, left_margin, right_edge),
                        }
                    )
                add("\n")

    return "".join(parts), {"tipo": "pdf", "paginas": pages, "lineas": lines, "estilos": styles}

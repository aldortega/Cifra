import pymupdf

from app.anonymizer.leak import assert_no_leak

FONT = "helv"
MAX_FONT_SIZE = 9.0
MIN_FONT_SIZE = 4.0


def _font_size_for(marker: str, rect: pymupdf.Rect) -> float:
    """Tamaño que entra en el recuadro, reduciendo la fuente hasta un mínimo legible."""
    size = min(MAX_FONT_SIZE, max(rect.height * 0.8, MIN_FONT_SIZE))
    while size > MIN_FONT_SIZE and pymupdf.get_text_length(marker, FONT, size) > rect.width:
        size -= 0.5
    return size


def export_pdf(data: bytes, replacements: dict[str, str]) -> bytes:
    doc = pymupdf.open(stream=data)
    ordered = sorted(replacements.items(), key=lambda kv: len(kv[0]), reverse=True)
    for page in doc:
        for original, marker in ordered:
            for rect in page.search_for(original):
                page.add_redact_annot(
                    rect,
                    text=marker,
                    fontname=FONT,
                    fontsize=_font_size_for(marker, rect),
                    fill=(1, 1, 1),
                )
        page.apply_redactions()
    doc.set_metadata({})
    doc.del_xml_metadata()
    out = doc.tobytes(garbage=4, deflate=True, clean=True)
    assert_no_leak("\n".join(page.get_text() for page in pymupdf.open(stream=out)), replacements)
    return out

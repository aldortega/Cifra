import pymupdf

from app.anonymizer.export_docx import LeakError


def export_pdf(data: bytes, replacements: dict[str, str]) -> bytes:
    doc = pymupdf.open(stream=data)
    ordered = sorted(replacements.items(), key=lambda kv: len(kv[0]), reverse=True)
    for page in doc:
        for original, marker in ordered:
            for rect in page.search_for(original):
                page.add_redact_annot(rect, text=marker, fontsize=9, fill=(1, 1, 1))
        page.apply_redactions()
    doc.set_metadata({})
    doc.del_xml_metadata()
    out = doc.tobytes(garbage=4, deflate=True, clean=True)
    remaining = "".join(page.get_text() for page in pymupdf.open(stream=out))
    if any(original in remaining for original in replacements):
        raise LeakError("Quedan valores confirmados en el documento exportado")
    return out

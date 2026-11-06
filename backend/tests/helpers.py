import io
import zipfile

import pymupdf
from docx import Document


def docx_bytes(*paragraphs: str) -> bytes:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def docx_with_comments(*paragraphs: str) -> bytes:
    src = zipfile.ZipFile(io.BytesIO(docx_bytes(*paragraphs)))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as dst:
        for item in src.infolist():
            dst.writestr(item, src.read(item.filename))
        dst.writestr("word/comments.xml", "<comments/>")
    return out.getvalue()


def pdf_bytes(*pages: str) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_text((72, 100), text)
    return doc.tobytes()

import io
import zipfile

from docx import Document
from docx.text.paragraph import Paragraph
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


class LeakError(Exception):
    """Quedó un valor confirmado en el archivo exportado."""


def _replace_in_paragraph(paragraph: Paragraph, replacements: dict[str, str]) -> None:
    full = paragraph.text
    new = full
    for original, marker in replacements.items():
        new = new.replace(original, marker)
    if new == full or not paragraph.runs:
        return
    paragraph.runs[0].text = new
    for run in paragraph.runs[1:]:
        run.text = ""


def _paragraphs(doc):
    yield from doc.paragraphs
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from cell.paragraphs
    for section in doc.sections:
        for part in (section.header, section.footer):
            yield from part.paragraphs
            for table in part.tables:
                for row in table.rows:
                    for cell in row.cells:
                        yield from cell.paragraphs


def _remaining_text(data: bytes) -> str:
    chunks: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if not name.endswith(".xml"):
                continue
            root = etree.fromstring(z.read(name))
            for p in root.iter(f"{{{W}}}p"):
                chunks.append("".join(t.text or "" for t in p.iter(f"{{{W}}}t")))
            chunks.append("".join(root.itertext()) if name.startswith("docProps/") else "")
    return "\n".join(chunks)


def export_docx(data: bytes, replacements: dict[str, str]) -> bytes:
    doc = Document(io.BytesIO(data))
    ordered = dict(sorted(replacements.items(), key=lambda kv: len(kv[0]), reverse=True))
    for paragraph in _paragraphs(doc):
        _replace_in_paragraph(paragraph, ordered)
    props = doc.core_properties
    props.author = props.last_modified_by = props.title = props.subject = ""
    props.keywords = props.comments = props.category = ""
    buf = io.BytesIO()
    doc.save(buf)
    out = buf.getvalue()
    remaining = _remaining_text(out)
    if any(original in remaining for original in replacements):
        raise LeakError("Quedan valores confirmados en el documento exportado")
    return out

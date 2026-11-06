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


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
FOOTNOTES_XML = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="{W_NS}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:footnote>
  {{notes}}
</w:footnotes>"""


def docx_with_footnotes_and_page_field(body: list[str], notes: dict[int, str]) -> bytes:
    """DOCX con notas al pie reales y un pie "Pág. <PAGE> de <NUMPAGES>".

    En `body`, "[^N]" marca dónde va la llamada a la nota N.
    """
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    doc = Document()

    def field(paragraph, instr: str) -> None:
        for kind, text in (("begin", None), ("instr", instr), ("separate", None), ("end", None)):
            run = OxmlElement("w:r")
            if kind == "instr":
                el = OxmlElement("w:instrText")
                el.text = text
            else:
                el = OxmlElement("w:fldChar")
                el.set(qn("w:fldCharType"), kind)
            run.append(el)
            paragraph._p.append(run)

    footer = doc.sections[0].footer.paragraphs[0]
    footer.add_run("Pág. ")
    field(footer, " PAGE ")
    footer.add_run(" de ")
    field(footer, " NUMPAGES ")

    for line in body:
        paragraph = doc.add_paragraph()
        for i, piece in enumerate(line.split("[^")):
            if i:
                note_id, piece = piece.split("]", 1)
                run = OxmlElement("w:r")
                ref = OxmlElement("w:footnoteReference")
                ref.set(qn("w:id"), note_id)
                run.append(ref)
                paragraph._p.append(run)
            if piece:
                paragraph.add_run(piece)

    buf = io.BytesIO()
    doc.save(buf)
    notes_xml = "".join(
        f'<w:footnote w:id="{n}"><w:p><w:r><w:footnoteRef/></w:r>'
        f'<w:r><w:t xml:space="preserve"> {text}</w:t></w:r></w:p></w:footnote>'
        for n, text in notes.items()
    )
    src = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as dst:
        for item in src.infolist():
            payload = src.read(item.filename)
            if item.filename == "[Content_Types].xml":
                payload = payload.replace(
                    b"</Types>",
                    b'<Override PartName="/word/footnotes.xml" ContentType="application/'
                    b'vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>',
                )
            elif item.filename == "word/_rels/document.xml.rels":
                payload = payload.replace(
                    b"</Relationships>",
                    b'<Relationship Id="rIdNotas" Type="http://schemas.openxmlformats.org/'
                    b'officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'
                    b"</Relationships>",
                )
            dst.writestr(item, payload)
        dst.writestr("word/footnotes.xml", FOOTNOTES_XML.replace("{notes}", notes_xml))
    return out.getvalue()

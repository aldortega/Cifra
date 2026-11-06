import io
import zipfile

from lxml import etree

from app.anonymizer.leak import assert_no_leak
from app.anonymizer.replacement import replace_all

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
CONTENT_PARTS = ("document", "header", "footer", "footnotes", "endnotes")
TRACKED = ("ins", "del", "moveFrom", "moveTo")
CORE_FIELDS = (
    "creator",
    "lastModifiedBy",
    "title",
    "subject",
    "keywords",
    "description",
    "category",
)
APP_FIELDS = ("Company", "Manager", "HyperlinkBase", "Template")


class UnsupportedDocumentError(Exception):
    """El documento no se puede anonimizar de forma segura y hay que corregirlo antes."""


def _is_content_part(name: str) -> bool:
    if not (name.startswith("word/") and name.endswith(".xml")) or "/" in name[5:]:
        return False
    stem = name[5:-4].rstrip("0123456789")
    return stem in CONTENT_PARTS


def _parse(data: bytes) -> etree._Element:
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    return etree.fromstring(data, parser)


def _own_texts(paragraph: etree._Element) -> list[etree._Element]:
    """Elementos w:t del párrafo, sin los de párrafos anidados (p. ej. cuadros de texto)."""
    return [
        t for t in paragraph.iter(f"{{{W}}}t") if next(t.iterancestors(f"{{{W}}}p")) is paragraph
    ]


def _rewrite_content(root: etree._Element, replacements: dict[str, str]) -> None:
    for paragraph in root.iter(f"{{{W}}}p"):
        texts = _own_texts(paragraph)
        if not texts:
            continue
        original = "".join(t.text or "" for t in texts)
        new = replace_all(original, replacements)
        if new == original:
            continue
        texts[0].text = new
        texts[0].set(XML_SPACE, "preserve")
        for t in texts[1:]:
            t.text = ""


def _blank_fields(root: etree._Element, fields: tuple[str, ...]) -> None:
    for element in root.iter():
        if isinstance(element.tag, str) and etree.QName(element).localname in fields:
            element.text = ""


def _reject_unsupported(names: list[str], roots: dict[str, etree._Element]) -> None:
    if any(name.startswith("word/comments") for name in names):
        raise UnsupportedDocumentError(
            "El documento tiene comentarios: eliminalos antes de subirlo."
        )
    for root in roots.values():
        if next(root.iter(*(f"{{{W}}}{tag}" for tag in TRACKED)), None) is not None:
            raise UnsupportedDocumentError(
                "El documento tiene control de cambios: aceptá o rechazá los cambios "
                "antes de subirlo."
            )


DESCRIPTIVE_ATTRIBUTES = frozenset(
    {"descr", "title", "alt", "Target", "tooltip", "author", "initials"}
)


def _visible_text(data: bytes) -> str:
    """Contenido y descripciones del paquete (las propiedades se vacían aparte)."""
    chunks: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if not name.endswith((".xml", ".rels")):
                continue
            if not (_is_content_part(name) or name.endswith(".rels")):
                continue
            root = _parse(z.read(name))
            paragraphs = root.iter(f"{{{W}}}p")
            chunks += ["".join(t.text or "" for t in p.iter(f"{{{W}}}t")) for p in paragraphs]
            for element in root.iter():
                for key, value in element.attrib.items():
                    if etree.QName(key).localname in DESCRIPTIVE_ATTRIBUTES:
                        chunks.append(str(value))
                chunks += [element.text or "", element.tail or ""]
    return "\n".join(chunks)


def check_docx_supported(data: bytes) -> None:
    """Falla con UnsupportedDocumentError si el DOCX trae comentarios o control de cambios."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        roots = {n: _parse(z.read(n)) for n in names if _is_content_part(n)}
    _reject_unsupported(names, roots)


def docx_text(data: bytes) -> str:
    """Texto del documento (cuerpo, encabezados, pies y notas), un párrafo por línea."""
    lines: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in sorted(n for n in z.namelist() if _is_content_part(n)):
            root = _parse(z.read(name))
            for paragraph in root.iter(f"{{{W}}}p"):
                text = "".join(t.text or "" for t in _own_texts(paragraph))
                if text.strip():
                    lines.append(text)
    return "\n".join(lines)


def export_docx(data: bytes, replacements: dict[str, str]) -> bytes:
    with zipfile.ZipFile(io.BytesIO(data)) as src:
        names = src.namelist()
        content = {n: _parse(src.read(n)) for n in names if _is_content_part(n)}
        _reject_unsupported(names, content)
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
            for item in src.infolist():
                payload = src.read(item.filename)
                if item.filename in content:
                    root = content[item.filename]
                    _rewrite_content(root, replacements)
                    payload = etree.tostring(
                        root, xml_declaration=True, encoding="UTF-8", standalone=True
                    )
                elif item.filename == "docProps/core.xml":
                    root = _parse(payload)
                    _blank_fields(root, CORE_FIELDS)
                    payload = etree.tostring(
                        root, xml_declaration=True, encoding="UTF-8", standalone=True
                    )
                elif item.filename == "docProps/app.xml":
                    root = _parse(payload)
                    _blank_fields(root, APP_FIELDS)
                    payload = etree.tostring(
                        root, xml_declaration=True, encoding="UTF-8", standalone=True
                    )
                elif item.filename == "docProps/custom.xml":
                    root = _parse(payload)
                    for child in list(root):
                        root.remove(child)
                    payload = etree.tostring(
                        root, xml_declaration=True, encoding="UTF-8", standalone=True
                    )
                dst.writestr(item, payload)
    result = out.getvalue()
    assert_no_leak(_visible_text(result), replacements)
    return result

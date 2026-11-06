import re

SENTENCE_END = re.compile(r"(?<=[.;:!?])\s+")


def _pieces(paragraph: str, max_chars: int) -> list[str]:
    """Parte un párrafo largo en oraciones; si una oración sola no entra, la corta a la fuerza."""
    if len(paragraph) <= max_chars:
        return [paragraph]
    out: list[str] = []
    for sentence in SENTENCE_END.split(paragraph):
        while len(sentence) > max_chars:
            cut = sentence.rfind(" ", 0, max_chars)
            cut = cut if cut > 0 else max_chars
            out.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        if sentence:
            out.append(sentence)
    return out


def split_into_fragments(text: str, max_chars: int) -> list[str]:
    """Agrupa párrafos (u oraciones, si un párrafo es largo) en fragmentos de hasta `max_chars`."""
    fragments: list[str] = []
    current = ""
    for paragraph in text.split("\n"):
        for piece in _pieces(paragraph, max_chars):
            candidate = f"{current}\n{piece}" if current else piece
            if len(candidate) <= max_chars:
                current = candidate
                continue
            if current.strip():
                fragments.append(current)
            current = piece
    if current.strip():
        fragments.append(current)
    return fragments

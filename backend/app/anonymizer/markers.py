import re
import unicodedata
from dataclasses import dataclass

ALWAYS_ACTIVE = frozenset({"MENOR"})


@dataclass(frozen=True)
class Detection:
    category: str
    start: int
    end: int


@dataclass(frozen=True)
class Anonymized:
    text: str


def normalize(value: str) -> str:
    """Clave de igualdad: sin tildes, sin mayúsculas, sin puntuación ni espacios repetidos."""
    decomposed = unicodedata.normalize("NFD", value)
    base = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[\W_]+", " ", base.casefold()).strip()


def anonymize(text: str, detections: list[Detection], active: set[str]) -> Anonymized:
    numbers: dict[tuple[str, str], int] = {}
    counters: dict[str, int] = {}
    replacements: list[tuple[int, int, str]] = []
    enabled = active | ALWAYS_ACTIVE
    for det in sorted(detections, key=lambda d: d.start):
        if det.category not in enabled:
            continue
        key = (det.category, normalize(text[det.start : det.end]))
        if key not in numbers:
            counters[det.category] = counters.get(det.category, 0) + 1
            numbers[key] = counters[det.category]
        replacements.append((det.start, det.end, f"[{det.category} {numbers[key]}]"))
    out = text
    for start, end, marker in reversed(replacements):
        out = out[:start] + marker + out[end:]
    return Anonymized(out)

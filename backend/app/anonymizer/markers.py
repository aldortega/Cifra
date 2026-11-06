import re
import unicodedata
from dataclasses import dataclass

ALWAYS_ACTIVE = frozenset({"MENOR"})
DEFAULT_ACTIVE = frozenset(
    {"PERSONA", "DNI", "DOMICILIO", "TELEFONO", "EMAIL", "FECHA_NACIMIENTO", "MATRICULA", "CBU"}
    | {"SALUD"}
    | ALWAYS_ACTIVE
)


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


def _plan(
    text: str, detections: list[Detection], active: set[str] | frozenset[str]
) -> list[tuple[int, int, str]]:
    """Tramos a reemplazar con su marcador. Las detecciones solapadas descartan a la posterior."""
    enabled = set(active) | ALWAYS_ACTIVE
    numbers: dict[tuple[str, str], int] = {}
    counters: dict[str, int] = {}
    plan: list[tuple[int, int, str]] = []
    cursor = 0
    for det in sorted(detections, key=lambda d: (d.start, -d.end)):
        if det.category not in enabled or det.start < cursor or det.end <= det.start:
            continue
        key = (det.category, normalize(text[det.start : det.end]))
        if key not in numbers:
            counters[det.category] = counters.get(det.category, 0) + 1
            numbers[key] = counters[det.category]
        plan.append((det.start, det.end, f"[{det.category} {numbers[key]}]"))
        cursor = det.end
    return plan


def anonymize(
    text: str, detections: list[Detection], active: set[str] | frozenset[str] = DEFAULT_ACTIVE
) -> Anonymized:
    out = text
    for start, end, marker in reversed(_plan(text, detections, active)):
        out = out[:start] + marker + out[end:]
    return Anonymized(out)


def build_replacements(
    text: str, detections: list[Detection], active: set[str] | frozenset[str] = DEFAULT_ACTIVE
) -> dict[str, str]:
    """Valor literal -> marcador, para aplicar sobre el archivo original."""
    replacements: dict[str, str] = {}
    for start, end, marker in _plan(text, detections, active):
        replacements.setdefault(text[start:end], marker)
    return replacements

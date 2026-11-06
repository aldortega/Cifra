import re
import unicodedata
from dataclasses import dataclass

ALWAYS_ACTIVE = frozenset({"MENOR"})
DEFAULT_ACTIVE = frozenset(
    {"PERSONA", "DNI", "DOMICILIO", "TELEFONO", "EMAIL", "FECHA_NACIMIENTO", "MATRICULA", "CBU"}
    | {"SALUD", "MATRICULA_PROFESIONAL", "POLIZA"}
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


PERSON_CATEGORIES = frozenset({"PERSONA", "MENOR"})
COURTESY_TITLES = frozenset(
    {"dr", "dra", "dres", "sr", "sra", "srta", "ing", "lic", "cdor", "cdora", "prof", "don", "dona"}
)


def _name_tokens(value: str) -> frozenset[str]:
    """Palabras del nombre sin tratamientos ni orden: 'GÓMEZ, Roberto' = 'Dr. Roberto Gómez'."""
    return frozenset(normalize(value).split()) - COURTESY_TITLES


def _identity_keys(text: str, detections: list[Detection]) -> dict[Detection, str]:
    """Clave de igualdad de cada detección. Las menciones de una misma persona comparten clave.

    Una mención cuyo nombre está contenido en el de una única persona (p. ej. solo el apellido)
    se une a ella; si encaja en varias, queda como persona aparte para que la revisión decida.
    """
    keys: dict[Detection, str] = {}
    names: dict[Detection, frozenset[str]] = {}
    for det in detections:
        value = text[det.start : det.end]
        tokens = _name_tokens(value) if det.category in PERSON_CATEGORIES else frozenset()
        if tokens:
            names[det] = tokens
        else:
            keys[det] = normalize(value)
    distinct = set(names.values())
    complete = [n for n in distinct if not any(n < other for other in distinct)]
    for det, tokens in names.items():
        owners = [n for n in complete if tokens <= n]
        identity = owners[0] if len(owners) == 1 else tokens
        keys[det] = " ".join(sorted(identity))
    return keys


def _plan(
    text: str, detections: list[Detection], active: set[str] | frozenset[str]
) -> list[tuple[int, int, str]]:
    """Tramos a reemplazar con su marcador. Las detecciones solapadas descartan a la posterior."""
    enabled = set(active) | ALWAYS_ACTIVE
    kept: list[Detection] = []
    cursor = 0
    for det in sorted(detections, key=lambda d: (d.start, -d.end)):
        if det.category not in enabled or det.start < cursor or det.end <= det.start:
            continue
        kept.append(det)
        cursor = det.end
    identities = _identity_keys(text, kept)
    numbers: dict[tuple[str, str], int] = {}
    counters: dict[str, int] = {}
    plan: list[tuple[int, int, str]] = []
    for det in kept:
        key = (det.category, identities[det])
        if key not in numbers:
            counters[det.category] = counters.get(det.category, 0) + 1
            numbers[key] = counters[det.category]
        plan.append((det.start, det.end, f"[{det.category} {numbers[key]}]"))
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

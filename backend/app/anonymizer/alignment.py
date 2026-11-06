import re

from app.anonymizer.markers import Detection
from app.anonymizer.replacement import value_pattern


def align_extractions(text: str, extractions: list[tuple[str, str]]) -> list[Detection]:
    """Una detección por cada aparición exacta de cada (categoría, valor) extraído.

    No se confía en las posiciones que devuelve el modelo: con valores repetidos suelen quedar
    truncadas o corridas. Los valores que no figuran literalmente en el texto se descartan.
    """
    detections: dict[tuple[str, int, int], Detection] = {}
    for category, value in set(extractions):
        if not value.strip():
            continue
        for match in re.finditer(value_pattern(value), text):
            detections[(category, match.start(), match.end())] = Detection(
                category, match.start(), match.end()
            )
    return sorted(detections.values(), key=lambda d: (d.start, d.end, d.category))


_CARATULA_SEPARATOR = re.compile(r"\s+[cs]/\s+", re.IGNORECASE)
_SURNAME_FIRST = re.compile(r"^[^\W\d][^,]*,\s*[^\W\d][^,]*$")


def caratula_parties(extractions: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Personas 'APELLIDO, Nombre' de cada carátula extraída, por si el modelo no las separó.

    Así los nombres siguen anonimizándose si la carátula se desactiva o se descarta.
    El último tramo (tras 's/') es el objeto del juicio y no se considera.
    """
    parties = []
    for category, value in extractions:
        if category != "CARATULA":
            continue
        for part in _CARATULA_SEPARATOR.split(value.strip())[:-1]:
            if _SURNAME_FIRST.match(part.strip()):
                parties.append(("PERSONA", part.strip()))
    return parties

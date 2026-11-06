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

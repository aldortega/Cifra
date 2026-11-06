import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.anonymizer.markers import Detection


class Extractor(Protocol):
    def extract(self, text: str) -> list[Detection]: ...


@dataclass(frozen=True)
class Case:
    text: str
    expected: list[tuple[str, str]]  # (categoría, valor literal)


def load_cases(directory: Path) -> list[Case]:
    cases = []
    for path in sorted(directory.glob("caso_*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        expected = [(e["category"], e["value"]) for e in raw["expected"]]
        cases.append(Case(raw["text"], expected))
    return cases


def _occurrences(text: str, value: str) -> list[tuple[int, int]]:
    spans, start = [], 0
    while (i := text.find(value, start)) >= 0:
        spans.append((i, i + len(value)))
        start = i + len(value)
    return spans


def _is_covered(case: Case, detections: list[Detection], category: str, value: str) -> bool:
    """Todas las apariciones del valor quedan dentro de alguna detección de su categoría."""
    spans = _occurrences(case.text, value)
    return bool(spans) and all(
        any(d.category == category and d.start <= a and d.end >= b for d in detections)
        for a, b in spans
    )


def recall_by_category(extractor: Extractor, cases: list[Case]) -> dict[str, float]:
    """Proporción de valores esperados que quedan totalmente cubiertos, por categoría."""
    found: dict[str, int] = {}
    total: dict[str, int] = {}
    for case in cases:
        detections = extractor.extract(case.text)
        for category, value in case.expected:
            total[category] = total.get(category, 0) + 1
            if _is_covered(case, detections, category, value):
                found[category] = found.get(category, 0) + 1
    return {c: found.get(c, 0) / n for c, n in total.items()}

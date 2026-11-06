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


def recall_by_category(extractor: Extractor, cases: list[Case]) -> dict[str, float]:
    found: dict[str, int] = {}
    total: dict[str, int] = {}
    for case in cases:
        detected = {(d.category, case.text[d.start : d.end]) for d in extractor.extract(case.text)}
        for category, value in case.expected:
            total[category] = total.get(category, 0) + 1
            if (category, value) in detected:
                found[category] = found.get(category, 0) + 1
    return {c: found.get(c, 0) / n for c, n in total.items()}

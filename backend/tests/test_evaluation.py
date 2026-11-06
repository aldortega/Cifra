import json
from pathlib import Path

from app.anonymizer.evaluation import Case, load_cases, recall_by_category
from app.anonymizer.markers import Detection

FIXTURES = Path(__file__).parent / "fixtures"


class FakeExtractor:
    """Detecta solo lo que se le indica, por valor literal."""

    def __init__(self, found: dict[str, str]) -> None:
        self.found = found

    def extract(self, text: str) -> list[Detection]:
        out = []
        for value, category in self.found.items():
            start = text.find(value)
            if start >= 0:
                out.append(Detection(category, start, start + len(value)))
        return out


def test_recall_is_computed_per_category() -> None:
    case = Case(
        text="Ana Paz DNI 1 y Luis Gil DNI 2",
        expected=[
            ("PERSONA", "Ana Paz"),
            ("PERSONA", "Luis Gil"),
            ("DNI", "1"),
        ],
    )
    extractor = FakeExtractor({"Ana Paz": "PERSONA", "Luis Gil": "PERSONA"})
    assert recall_by_category(extractor, [case]) == {"PERSONA": 1.0, "DNI": 0.0}


def test_wrong_category_does_not_count_as_found() -> None:
    case = Case(text="Ana Paz", expected=[("PERSONA", "Ana Paz")])
    assert recall_by_category(FakeExtractor({"Ana Paz": "DOMICILIO"}), [case]) == {"PERSONA": 0.0}


def test_loads_synthetic_fixtures() -> None:
    cases = load_cases(FIXTURES)
    assert cases
    raw = json.loads((FIXTURES / "caso_01.json").read_text())
    for category, value in cases[0].expected:
        assert value in raw["text"], (category, value)

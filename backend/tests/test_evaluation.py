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


class SpanExtractor:
    def __init__(self, spans: list[tuple[str, int, int]]) -> None:
        self.spans = spans

    def extract(self, text: str) -> list[Detection]:
        return [Detection(c, s, e) for c, s, e in self.spans]


def test_a_wider_detection_still_covers_the_expected_value() -> None:
    text = "vive en calle Mitre 450, de la ciudad de Rosario"
    case = Case(text=text, expected=[("DOMICILIO", "calle Mitre 450")])
    extractor = SpanExtractor([("DOMICILIO", 8, len(text))])
    assert recall_by_category(extractor, [case]) == {"DOMICILIO": 1.0}


def test_a_narrower_detection_leaves_part_of_the_value_exposed() -> None:
    text = "ROBERTO CARLOS GÓMEZ"
    case = Case(text=text, expected=[("PERSONA", "ROBERTO CARLOS GÓMEZ")])
    extractor = SpanExtractor([("PERSONA", 0, 14)])
    assert recall_by_category(extractor, [case]) == {"PERSONA": 0.0}


def test_every_occurrence_of_the_value_must_be_covered() -> None:
    text = "Ana Paz y luego Ana Paz"
    case = Case(text=text, expected=[("PERSONA", "Ana Paz")])
    extractor = SpanExtractor([("PERSONA", 0, 7)])
    assert recall_by_category(extractor, [case]) == {"PERSONA": 0.0}


def test_occurrences_inside_other_numbers_do_not_count() -> None:
    text = "M.P. N° 876 y CUIL 27-27987654-1"
    case = Case(text=text, expected=[("MATRICULA_PROFESIONAL", "876")])
    extractor = SpanExtractor([("MATRICULA_PROFESIONAL", 8, 11)])
    assert recall_by_category(extractor, [case]) == {"MATRICULA_PROFESIONAL": 1.0}

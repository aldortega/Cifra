from app.anonymizer.alignment import align_extractions
from app.anonymizer.markers import Detection


def spans(text: str, detections: list[Detection]) -> list[tuple[str, str]]:
    return [(d.category, text[d.start : d.end]) for d in detections]


def test_every_exact_occurrence_of_an_extracted_value_is_detected() -> None:
    text = "DNI N° 30.456.789 y luego DNI 30.456.789."
    found = align_extractions(text, [("DNI", "30.456.789")])
    assert spans(text, found) == [("DNI", "30.456.789"), ("DNI", "30.456.789")]


def test_values_not_literally_in_the_text_are_skipped() -> None:
    assert align_extractions("Juan vive aquí", [("PERSONA", "Juan Pérez")]) == []


def test_matches_whole_words_and_tolerates_line_breaks() -> None:
    text = "tiene asma y asmático; Juan\nPérez declaró"
    found = align_extractions(text, [("SALUD", "asma"), ("PERSONA", "Juan Pérez")])
    assert spans(text, found) == [("SALUD", "asma"), ("PERSONA", "Juan\nPérez")]


def test_duplicated_pairs_do_not_duplicate_detections() -> None:
    text = "Ana Paz"
    found = align_extractions(text, [("PERSONA", "Ana Paz"), ("PERSONA", "Ana Paz")])
    assert len(found) == 1

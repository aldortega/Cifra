from app.anonymizer.markers import DEFAULT_ACTIVE, Detection, anonymize, build_replacements


def test_replaces_a_detection_with_numbered_marker() -> None:
    text = "DNI 20.123.456 del actor"
    result = anonymize(text, [Detection("DNI", 4, 14)], active={"DNI"})
    assert result.text == "DNI [DNI 1] del actor"


def test_same_value_keeps_number_and_different_value_gets_next() -> None:
    text = "Juan Pérez y María López. JUAN PEREZ declaró."
    dets = [
        Detection("PERSONA", 0, 10),
        Detection("PERSONA", 13, 24),
        Detection("PERSONA", 26, 36),
    ]
    result = anonymize(text, dets, active={"PERSONA"})
    assert result.text == "[PERSONA 1] y [PERSONA 2]. [PERSONA 1] declaró."


def test_numbering_is_independent_per_category() -> None:
    text = "Ana 20.123.456 y 30.111.222"
    dets = [Detection("PERSONA", 0, 3), Detection("DNI", 4, 14), Detection("DNI", 17, 27)]
    result = anonymize(text, dets, active={"PERSONA", "DNI"})
    assert result.text == "[PERSONA 1] [DNI 1] y [DNI 2]"


def test_inactive_category_is_left_untouched() -> None:
    text = "Tel 11 5555-1234 y DNI 20.123.456"
    dets = [Detection("TELEFONO", 4, 16), Detection("DNI", 23, 33)]
    result = anonymize(text, dets, active={"DNI"})
    assert result.text == "Tel 11 5555-1234 y DNI [DNI 1]"


def test_minor_is_always_anonymized_even_if_not_active() -> None:
    text = "El menor Lucas Gómez"
    result = anonymize(text, [Detection("MENOR", 9, 20)], active=set())
    assert result.text == "El menor [MENOR 1]"


def test_overlapping_detections_keep_the_earlier_and_drop_the_rest() -> None:
    text = "Juan Pérez vive aquí"
    dets = [Detection("PERSONA", 0, 10), Detection("PERSONA", 5, 10)]
    result = anonymize(text, dets, active={"PERSONA"})
    assert result.text == "[PERSONA 1] vive aquí"


def test_default_categories_exclude_expediente_only() -> None:
    assert "EXPEDIENTE" not in DEFAULT_ACTIVE
    assert {"PERSONA", "DNI", "DOMICILIO", "TELEFONO", "MENOR"} <= DEFAULT_ACTIVE


def test_replacements_map_each_literal_value_to_its_marker() -> None:
    text = "Juan Pérez, DNI 20.123.456. JUAN PEREZ y Ana. Tel 1155"
    dets = [
        Detection("PERSONA", 0, 10),
        Detection("DNI", 16, 26),
        Detection("PERSONA", 28, 38),
        Detection("TELEFONO", 50, 54),
    ]
    assert build_replacements(text, dets, active={"PERSONA", "DNI"}) == {
        "Juan Pérez": "[PERSONA 1]",
        "20.123.456": "[DNI 1]",
        "JUAN PEREZ": "[PERSONA 1]",
    }

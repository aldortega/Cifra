from app.anonymizer.langextract_extractor import CATEGORIES
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


def test_every_category_is_active_by_default() -> None:
    assert set(CATEGORIES) == DEFAULT_ACTIVE


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


def persons(text: str, *values: str) -> list[Detection]:
    dets, start = [], 0
    for value in values:
        i = text.index(value, start)
        dets.append(Detection("PERSONA", i, i + len(value)))
        start = i + len(value)
    return dets


def test_inverted_caratula_name_is_the_same_person() -> None:
    text = '"GÓMEZ, ROBERTO CARLOS c/ X". El Sr. ROBERTO CARLOS GÓMEZ demanda.'
    dets = persons(text, "GÓMEZ, ROBERTO CARLOS", "ROBERTO CARLOS GÓMEZ")
    result = anonymize(text, dets, active={"PERSONA"})
    assert result.text == '"[PERSONA 1] c/ X". El Sr. [PERSONA 1] demanda.'


def test_courtesy_titles_do_not_split_a_person() -> None:
    text = "el Dr. Sergio Ledesma y luego Sergio Ledesma"
    dets = persons(text, "Dr. Sergio Ledesma", "Sergio Ledesma")
    assert anonymize(text, dets, active={"PERSONA"}).text == "el [PERSONA 1] y luego [PERSONA 1]"


def test_a_surname_alone_joins_the_only_person_who_has_it() -> None:
    text = "perito Pablo Esteban Romero y testigo Ana Paz. Romero concluyó."
    dets = persons(text, "Pablo Esteban Romero", "Ana Paz", "Romero")
    result = anonymize(text, dets, active={"PERSONA"})
    assert result.text == "perito [PERSONA 1] y testigo [PERSONA 2]. [PERSONA 1] concluyó."


def test_an_ambiguous_surname_stays_a_separate_person() -> None:
    text = "Carlos Ibarra y Tomás Ibarra. Ibarra declaró."
    dets = persons(text, "Carlos Ibarra", "Tomás Ibarra", "Ibarra")
    result = anonymize(text, dets, active={"PERSONA"})
    assert result.text == "[PERSONA 1] y [PERSONA 2]. [PERSONA 3] declaró."


def test_replacements_give_every_variant_the_same_marker() -> None:
    text = "GÓMEZ, ROBERTO CARLOS y ROBERTO CARLOS GÓMEZ"
    dets = persons(text, "GÓMEZ, ROBERTO CARLOS", "ROBERTO CARLOS GÓMEZ")
    assert build_replacements(text, dets, active={"PERSONA"}) == {
        "GÓMEZ, ROBERTO CARLOS": "[PERSONA 1]",
        "ROBERTO CARLOS GÓMEZ": "[PERSONA 1]",
    }


def test_active_caratula_covers_the_names_it_contains() -> None:
    text = 'Autos "PAZ, Ana c/ ROJAS, Eva s/ daños". PAZ, Ana declaró.'
    dets = [
        Detection("CARATULA", 7, 38),
        Detection("PERSONA", 7, 15),
        Detection("PERSONA", 19, 29),
        Detection("PERSONA", 41, 49),
    ]
    both = anonymize(text, dets, active={"CARATULA", "PERSONA"})
    assert both.text == 'Autos "[CARATULA 1]". [PERSONA 1] declaró.'
    names_only = anonymize(text, dets, active={"PERSONA"})
    assert names_only.text == 'Autos "[PERSONA 1] c/ [PERSONA 2] s/ daños". [PERSONA 1] declaró.'

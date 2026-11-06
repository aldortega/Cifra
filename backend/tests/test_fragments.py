from app.anonymizer.fragments import split_into_fragments


def test_short_text_is_a_single_fragment() -> None:
    assert split_into_fragments("Una línea.\nOtra línea.", max_chars=100) == [
        "Una línea.\nOtra línea."
    ]


def test_paragraphs_are_packed_without_exceeding_the_limit() -> None:
    text = "\n".join(["a" * 40, "b" * 40, "c" * 40])
    assert split_into_fragments(text, max_chars=90) == ["a" * 40 + "\n" + "b" * 40, "c" * 40]


def test_a_long_paragraph_is_cut_at_sentence_ends() -> None:
    text = "Primera oración larga. Segunda oración larga. Tercera."
    fragments = split_into_fragments(text, max_chars=30)
    assert fragments == ["Primera oración larga.", "Segunda oración larga.", "Tercera."]


def test_fragments_together_keep_every_word() -> None:
    text = "\n\n".join(f"Párrafo {i}. Con algo de texto que ocupa lugar." for i in range(40))
    fragments = split_into_fragments(text, max_chars=200)
    assert all(len(f) <= 200 for f in fragments)
    assert " ".join(" ".join(fragments).split()) == " ".join(text.split())

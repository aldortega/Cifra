import re

from app.anonymizer.replacement import value_pattern


class LeakError(Exception):
    """Quedó un valor confirmado en el archivo exportado."""


def assert_no_leak(text: str, replacements: dict[str, str]) -> None:
    # Los marcadores insertados pueden contener palabras iguales a un valor: no cuentan como fuga.
    for marker in sorted(set(replacements.values()), key=len, reverse=True):
        text = text.replace(marker, " ")
    for value in replacements:
        if value.strip() and re.search(value_pattern(value), text):
            raise LeakError("Quedan valores confirmados en el documento exportado")

import re


def value_pattern(value: str) -> str:
    """Regex que encuentra el valor como palabra completa, tolerando saltos de línea internos."""
    parts = [re.escape(piece) for piece in value.split()]
    body = r"\s+".join(parts)
    start = r"(?<!\w)" if value[:1].isalnum() or value[:1] == "_" else ""
    end = r"(?!\w)" if value[-1:].isalnum() or value[-1:] == "_" else ""
    return f"{start}{body}{end}"


def replace_all(text: str, replacements: dict[str, str]) -> str:
    """Reemplaza todos los valores en una sola pasada, sin tocar los marcadores insertados."""
    values = sorted((v for v in replacements if v.strip()), key=len, reverse=True)
    if not values:
        return text
    pattern = re.compile("|".join(f"(?:{value_pattern(v)})" for v in values))
    lookup = {re.sub(r"\s+", " ", v): marker for v, marker in replacements.items()}

    def swap(match: re.Match[str]) -> str:
        return lookup[re.sub(r"\s+", " ", match.group(0))]

    return pattern.sub(swap, text)

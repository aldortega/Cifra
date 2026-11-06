"""Calcula el recall por categoría contra los fixtures sintéticos usando Gemini real.

Uso: uv run python evaluate.py   (requiere GEMINI_API_KEY)
"""

from pathlib import Path

from app.anonymizer.evaluation import load_cases, recall_by_category
from app.anonymizer.langextract_extractor import LangExtractExtractor
from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    extractor = LangExtractExtractor(settings.gemini_api_key, settings.gemini_model)
    cases = load_cases(Path(__file__).parent / "tests" / "fixtures")
    for category, recall in sorted(recall_by_category(extractor, cases).items()):
        print(f"{category:<18} {recall:.0%}")


if __name__ == "__main__":
    main()

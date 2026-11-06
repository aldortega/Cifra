from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.anonymizer.markers import Detection
from app.api.jobs import get_enqueue, get_store
from app.jobs.processing import process_job
from app.jobs.store import JobStore
from app.main import create_app


class FakeExtractor:
    """Detecta valores literales indicados; puede fallar las primeras `failures` veces."""

    def __init__(self, found: dict[str, str] | None = None, failures: int = 0) -> None:
        self.found = found or {}
        self.failures = failures
        self.calls = 0

    def extract(self, text: str, on_progress=None) -> list[Detection]:
        self.calls += 1
        if self.calls <= self.failures:
            raise RuntimeError("Gemini no disponible")
        out = []
        for value, category in self.found.items():
            start = 0
            while (i := text.find(value, start)) >= 0:
                out.append(Detection(category, i, i + len(value)))
                start = i + len(value)
        return out


@pytest.fixture
def store(tmp_path: Path) -> JobStore:
    return JobStore(tmp_path / "storage")


@pytest.fixture
def extractor() -> FakeExtractor:
    return FakeExtractor(
        {
            "Juan Pérez": "PERSONA",
            "20.123.456": "DNI",
            "Mitre 450": "DOMICILIO",
            "1234/2023": "EXPEDIENTE",
            "Lucas": "MENOR",
        }
    )


@pytest.fixture
def client(store: JobStore, extractor: FakeExtractor) -> Iterator[TestClient]:
    app = create_app()

    async def enqueue(job_id: str) -> None:
        process_job(store, job_id, extractor, sleep=lambda _s: None)

    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_enqueue] = lambda: enqueue
    with TestClient(app) as c:
        yield c

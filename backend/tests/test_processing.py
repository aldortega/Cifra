from fastapi.testclient import TestClient

from app.jobs.processing import process_job
from app.jobs.store import JobStore
from tests.conftest import FakeExtractor
from tests.helpers import docx_bytes


def new_job(store: JobStore) -> str:
    return store.create("a.docx", ".docx", ["PERSONA"], docx_bytes("El actor Juan Pérez."))


def test_retries_with_growing_backoff_and_then_succeeds(store: JobStore) -> None:
    job_id = new_job(store)
    sleeps: list[float] = []
    extractor = FakeExtractor({"Juan Pérez": "PERSONA"}, failures=2)
    process_job(store, job_id, extractor, sleep=sleeps.append)
    assert store.load(job_id)["estado"] == "en_revision"
    assert extractor.calls == 3
    assert sleeps == [2.0, 4.0]


def test_fails_after_three_attempts_without_partial_results(store: JobStore) -> None:
    job_id = new_job(store)
    extractor = FakeExtractor(failures=99)
    process_job(store, job_id, extractor, sleep=lambda _s: None)
    record = store.load(job_id)
    assert record["estado"] == "fallido"
    assert extractor.calls == 3
    assert record["detecciones"] is None
    assert "3 intentos" in record["error"]


def test_a_failed_job_can_be_retried(client: TestClient, store: JobStore, extractor) -> None:
    job_id = new_job(store)
    process_job(store, job_id, FakeExtractor(failures=99), sleep=lambda _s: None)
    assert client.get(f"/jobs/{job_id}").json()["estado"] == "fallido"
    assert client.post(f"/jobs/{job_id}/retry").status_code == 202
    assert client.get(f"/jobs/{job_id}").json()["estado"] == "en_revision"


def test_only_failed_jobs_can_be_retried(client: TestClient, store: JobStore) -> None:
    job_id = new_job(store)
    process_job(store, job_id, FakeExtractor(), sleep=lambda _s: None)
    assert client.post(f"/jobs/{job_id}/retry").status_code == 409


def test_a_job_purged_while_processing_stays_expired(store: JobStore) -> None:
    job_id = new_job(store)

    class PurgingExtractor(FakeExtractor):
        def extract(self, text, on_progress=None):
            store.discard_content(job_id, "vencido")
            return super().extract(text)

    process_job(store, job_id, PurgingExtractor({"Juan Pérez": "PERSONA"}), sleep=lambda _s: None)
    record = store.load(job_id)
    assert record["estado"] == "vencido"
    assert record["texto"] is None


class ProgressExtractor(FakeExtractor):
    """Informa avance en tres fragmentos y registra el estado guardado en cada paso."""

    def __init__(self, store: JobStore, job_id: str) -> None:
        super().__init__({"Juan Pérez": "PERSONA"})
        self.store, self.job_id, self.seen = store, job_id, []

    def extract(self, text, on_progress=None):
        for done in range(4):
            on_progress(done, 3)
            self.seen.append(self.store.load(self.job_id)["progreso"])
        return super().extract(text)


def test_progress_reports_real_stages_and_fragments(store: JobStore) -> None:
    job_id = new_job(store)
    extractor = ProgressExtractor(store, job_id)
    process_job(store, job_id, extractor, sleep=lambda _s: None)
    assert extractor.seen == [
        {"etapa": "analizando", "hechos": 0, "total": 3},
        {"etapa": "analizando", "hechos": 1, "total": 3},
        {"etapa": "analizando", "hechos": 2, "total": 3},
        {"etapa": "analizando", "hechos": 3, "total": 3},
    ]
    record = store.load(job_id)
    assert record["estado"] == "en_revision"
    assert record["progreso"] is None


def test_the_api_exposes_progress_while_processing(client: TestClient, store: JobStore) -> None:
    job_id = new_job(store)
    record = store.load(job_id)
    record["progreso"] = {"etapa": "analizando", "hechos": 2, "total": 5}
    store.save(job_id, record)
    assert client.get(f"/jobs/{job_id}").json()["progreso"] == {
        "etapa": "analizando",
        "hechos": 2,
        "total": 5,
    }

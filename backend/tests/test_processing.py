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
        def extract(self, text):
            store.discard_content(job_id, "vencido")
            return super().extract(text)

    process_job(store, job_id, PurgingExtractor({"Juan Pérez": "PERSONA"}), sleep=lambda _s: None)
    record = store.load(job_id)
    assert record["estado"] == "vencido"
    assert record["texto"] is None

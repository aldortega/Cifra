from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.jobs.processing import process_job
from app.jobs.retention import purge_expired
from app.jobs.store import JobStore
from tests.conftest import FakeExtractor
from tests.helpers import docx_bytes


def processed_job(store: JobStore) -> str:
    job_id = store.create("a.docx", ".docx", ["PERSONA"], docx_bytes("Juan Pérez"))
    process_job(store, job_id, FakeExtractor({"Juan Pérez": "PERSONA"}))
    return job_id


def test_jobs_older_than_the_ttl_lose_their_files_and_become_expired(
    store: JobStore, tmp_path: Path
) -> None:
    job_id = processed_job(store)
    later = datetime.now(UTC) + timedelta(hours=25)
    assert purge_expired(store, ttl_hours=24, now=later) == 1
    record = store.load(job_id)
    assert record["estado"] == "vencido"
    assert record["texto"] is None
    assert record["detecciones"] is None
    assert record["conteo"] == {"PERSONA": 1}
    assert not list((tmp_path / "storage").rglob("original.*"))


def test_recent_jobs_are_kept(store: JobStore) -> None:
    job_id = processed_job(store)
    assert purge_expired(store, ttl_hours=24, now=datetime.now(UTC) + timedelta(hours=23)) == 0
    assert store.load(job_id)["estado"] == "en_revision"


def test_purging_twice_does_not_count_the_same_job_again(store: JobStore) -> None:
    processed_job(store)
    later = datetime.now(UTC) + timedelta(hours=25)
    purge_expired(store, ttl_hours=24, now=later)
    assert purge_expired(store, ttl_hours=24, now=later) == 0

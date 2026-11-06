import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import docx_bytes, docx_with_comments, pdf_bytes

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXTO = "El actor Juan Pérez, DNI 20.123.456, vive en Mitre 450. Expte 1234/2023. El menor Lucas."


def upload(client: TestClient, name: str, data: bytes, categorias: list[str] | None = None):
    cats = categorias if categorias is not None else ["PERSONA", "DNI", "DOMICILIO"]
    return client.post(
        "/jobs",
        files={"archivo": (name, data, DOCX)},
        data={"categorias": cats},
    )


def test_upload_processes_and_exposes_pending_detections(client: TestClient) -> None:
    res = upload(client, "sentencia.docx", docx_bytes(TEXTO))
    assert res.status_code == 201
    job = client.get(f"/jobs/{res.json()['id']}").json()
    assert job["estado"] == "en_revision"
    assert job["nombreArchivo"] == "sentencia.docx"
    assert "Juan Pérez" in job["texto"]
    valores = {(d["categoria"], job["texto"][d["inicio"] : d["fin"]]) for d in job["detecciones"]}
    assert valores == {
        ("PERSONA", "Juan Pérez"),
        ("DNI", "20.123.456"),
        ("DOMICILIO", "Mitre 450"),
        ("MENOR", "Lucas"),
    }
    assert all(d["estado"] == "pendiente" for d in job["detecciones"])


def test_inactive_categories_are_not_detected_but_minors_always_are(client: TestClient) -> None:
    res = upload(client, "a.docx", docx_bytes(TEXTO), categorias=["EXPEDIENTE"])
    job = client.get(f"/jobs/{res.json()['id']}").json()
    categorias = {d["categoria"] for d in job["detecciones"]}
    assert categorias == {"EXPEDIENTE", "MENOR"}


def test_rejects_unsupported_extension(client: TestClient) -> None:
    res = upload(client, "notas.txt", b"hola")
    assert res.status_code == 422
    assert "PDF" in res.json()["detail"]


def test_rejects_scanned_pdf(client: TestClient) -> None:
    res = upload(client, "escaneo.pdf", pdf_bytes(""))
    assert res.status_code == 422
    assert "escaneado" in res.json()["detail"]


def test_rejects_docx_with_comments(client: TestClient) -> None:
    res = upload(client, "c.docx", docx_with_comments(TEXTO))
    assert res.status_code == 422
    assert "comentarios" in res.json()["detail"]


def test_rejects_documents_over_the_page_or_character_limit(client: TestClient) -> None:
    too_many_pages = upload(client, "largo.pdf", pdf_bytes(*["texto"] * 21))
    assert too_many_pages.status_code == 422
    assert "20 páginas" in too_many_pages.json()["detail"]
    too_long = upload(client, "enorme.docx", docx_bytes("a" * 50_001))
    assert too_long.status_code == 422
    assert "50000" in too_long.json()["detail"].replace(".", "").replace(" ", "")


def test_unknown_or_malformed_job_ids_do_not_exist(client: TestClient) -> None:
    assert client.get("/jobs/abcdefghijklmnopqrstuv").json()["estado"] == "vencido"
    assert client.get("/jobs/..%2F..%2Fetc").status_code in (404, 422)


def decisions(job: dict, estado: str) -> list[dict]:
    return [{**d, "estado": estado} for d in job["detecciones"]]


def test_export_requires_every_detection_to_be_reviewed(client: TestClient) -> None:
    job_id = upload(client, "a.docx", docx_bytes(TEXTO)).json()["id"]
    job = client.get(f"/jobs/{job_id}").json()
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": job["detecciones"]})
    assert res.status_code == 409
    assert "sin revisar" in res.json()["detail"]


def test_export_returns_anonymized_file_and_deletes_the_original(
    client: TestClient, store, tmp_path: Path
) -> None:
    job_id = upload(client, "a.docx", docx_bytes(TEXTO)).json()["id"]
    job = client.get(f"/jobs/{job_id}").json()
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": decisions(job, "confirmada")})
    assert res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        xml = z.read("word/document.xml").decode()
    assert "Juan Pérez" not in xml
    assert "[PERSONA 1]" in xml
    assert "[DNI 1]" in xml
    assert "[MENOR 1]" in xml
    # Después de exportar no queda el original ni el texto en disco.
    after = client.get(f"/jobs/{job_id}").json()
    assert after["estado"] == "exportado"
    assert "texto" not in after or after["texto"] is None
    assert not list((tmp_path / "storage").rglob("original.*"))
    again = client.post(f"/jobs/{job_id}/export", json={"detecciones": []})
    assert again.status_code == 409


def test_discarded_detections_are_kept_in_the_document(client: TestClient) -> None:
    job_id = upload(client, "a.docx", docx_bytes(TEXTO)).json()["id"]
    job = client.get(f"/jobs/{job_id}").json()
    estados = [
        {**d, "estado": "descartada" if d["categoria"] == "PERSONA" else "confirmada"}
        for d in job["detecciones"]
    ]
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": estados})
    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        xml = z.read("word/document.xml").decode()
    assert "Juan Pérez" in xml
    assert "[DNI 1]" in xml


def test_export_pdf_returns_pdf(client: TestClient) -> None:
    job_id = upload(client, "a.pdf", pdf_bytes(TEXTO)).json()["id"]
    job = client.get(f"/jobs/{job_id}").json()
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": decisions(job, "confirmada")})
    assert res.status_code == 200
    assert res.content.startswith(b"%PDF")
    assert res.headers["content-type"] == "application/pdf"


def test_export_rejects_ranges_outside_the_text(client: TestClient) -> None:
    job_id = upload(client, "a.docx", docx_bytes(TEXTO)).json()["id"]
    bad = [{"id": "x", "categoria": "DNI", "inicio": 0, "fin": 99999, "estado": "confirmada"}]
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": bad})
    assert res.status_code == 422


def test_minors_are_anonymized_even_if_the_client_discards_them(client: TestClient) -> None:
    job_id = upload(client, "a.docx", docx_bytes(TEXTO)).json()["id"]
    job = client.get(f"/jobs/{job_id}").json()
    estados = [
        {**d, "estado": "descartada" if d["categoria"] == "MENOR" else "confirmada"}
        for d in job["detecciones"]
    ]
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": estados})
    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        xml = z.read("word/document.xml").decode()
    assert "Lucas" not in xml
    assert "[MENOR 1]" in xml


def test_export_fails_if_the_client_skips_stored_detections(client: TestClient) -> None:
    job_id = upload(client, "a.docx", docx_bytes(TEXTO)).json()["id"]
    job = client.get(f"/jobs/{job_id}").json()
    partial = decisions(job, "confirmada")[:1]
    res = client.post(f"/jobs/{job_id}/export", json={"detecciones": partial})
    assert res.status_code == 409
    assert "sin revisar" in res.json()["detail"]


def test_job_in_review_includes_layout_matching_the_text(client: TestClient) -> None:
    res = upload(client, "caso.docx", docx_bytes("El actor Juan Pérez.", "Vive en Mitre 450."))
    job = client.get(f"/jobs/{res.json()['id']}").json()
    formato = job["formato"]
    assert formato["tipo"] == "docx"
    parrafos = [job["texto"][p["inicio"] : p["fin"]] for p in formato["parrafos"]]
    assert parrafos == ["El actor Juan Pérez.", "Vive en Mitre 450."]

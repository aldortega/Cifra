import json
import re
import secrets
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

JOB_ID = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
CONTENT_FIELDS = ("texto", "detecciones")


class JobStore:
    """Estado de cada trabajo en una carpeta propia: original y detecciones son temporales."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _dir(self, job_id: str) -> Path | None:
        return self.root / job_id if JOB_ID.fullmatch(job_id) else None

    def create(self, filename: str, extension: str, categories: list[str], original: bytes) -> str:
        job_id = secrets.token_urlsafe(24)
        folder = self.root / job_id
        folder.mkdir(parents=True)
        (folder / f"original{extension}").write_bytes(original)
        self.save(
            job_id,
            {
                "id": job_id,
                "nombreArchivo": filename,
                "extension": extension,
                "estado": "procesando",
                "categorias": categories,
                "creado": datetime.now(UTC).isoformat(),
                "error": None,
                "texto": None,
                "detecciones": None,
            },
        )
        return job_id

    def load(self, job_id: str) -> dict[str, Any] | None:
        folder = self._dir(job_id)
        if folder is None or not (folder / "estado.json").exists():
            return None
        return json.loads((folder / "estado.json").read_text(encoding="utf-8"))

    def save(self, job_id: str, record: dict[str, Any]) -> None:
        folder = self._dir(job_id)
        if folder is None:
            raise ValueError("Identificador de trabajo inválido")
        (folder / "estado.json").write_text(
            json.dumps(record, ensure_ascii=False), encoding="utf-8"
        )

    def read_original(self, job_id: str, extension: str) -> bytes:
        folder = self._dir(job_id)
        if folder is None:
            raise ValueError("Identificador de trabajo inválido")
        return (folder / f"original{extension}").read_bytes()

    def discard_content(self, job_id: str, estado: str) -> None:
        """Borra original, texto y detecciones; conserva solo metadatos y el nuevo estado."""
        record = self.load(job_id)
        folder = self._dir(job_id)
        if record is None or folder is None:
            return
        for original in folder.glob("original.*"):
            original.unlink()
        counts: dict[str, int] = {}
        for det in record.get("detecciones") or []:
            counts[det["categoria"]] = counts.get(det["categoria"], 0) + 1
        record.update(estado=estado, texto=None, detecciones=None, conteo=counts)
        self.save(job_id, record)

    def job_ids(self) -> list[str]:
        if not self.root.exists():
            return []
        return [p.name for p in self.root.iterdir() if p.is_dir()]

    def remove(self, job_id: str) -> None:
        folder = self._dir(job_id)
        if folder is not None:
            shutil.rmtree(folder, ignore_errors=True)

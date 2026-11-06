from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

import langextract as lx

from app.anonymizer.alignment import align_extractions
from app.anonymizer.fragments import split_into_fragments
from app.anonymizer.markers import Detection

FRAGMENT_CHARS = 1500
MAX_PARALLEL = 8

CATEGORIES = [
    "PERSONA", "DNI", "DOMICILIO", "TELEFONO", "EMAIL", "FECHA_NACIMIENTO",
    "MATRICULA", "MATRICULA_PROFESIONAL", "POLIZA", "CBU", "EXPEDIENTE", "SALUD", "MENOR",
]  # fmt: skip

PROMPT = (
    "Extraé del texto judicial argentino todos los datos sensibles, copiando el texto "
    "literal tal como aparece, sin parafrasear ni solapar. Categorías: "
    + ", ".join(CATEGORIES)
    + ". DNI incluye CUIL y CUIT. Las personas menores de edad van en MENOR, no en PERSONA. "
    "No extraigas roles procesales como 'el actor' o 'la demandada'. "
    "MATRICULA es el dominio o patente de un vehículo (p. ej. 'AB 123 CD' o 'AA123BB'). "
    "MATRICULA_PROFESIONAL es el número de matrícula de abogados, médicos o peritos (tras "
    "'Matrícula N°', 'M.P. N°' o 'T° F°'), copiando solo el número. POLIZA es el número de una "
    "póliza de seguro, copiando solo el número. Incluí las personas en la carátula, tanto en "
    "formato 'APELLIDO, Nombre' como en mayúsculas. Los números (DNI, CUIL, CUIT, teléfonos) se "
    "copian completos, con sus puntos y guiones."
)

EXAMPLES = [
    lx.data.ExampleData(
        text=(
            "El Dr. Pablo Ruiz, en representación de Laura Sosa, DNI 30.222.111, con domicilio "
            "real en Mitre 450, Rosario, informa que su hija Julieta, de 7 años, padece asma. "
            "Contacto: 341 555-0000, laura@example.com. Expte. 1234/2023."
        ),
        extractions=[
            lx.data.Extraction("PERSONA", "Pablo Ruiz"),
            lx.data.Extraction("PERSONA", "Laura Sosa"),
            lx.data.Extraction("DNI", "30.222.111"),
            lx.data.Extraction("DOMICILIO", "Mitre 450, Rosario"),
            lx.data.Extraction("MENOR", "Julieta"),
            lx.data.Extraction("SALUD", "asma"),
            lx.data.Extraction("TELEFONO", "341 555-0000"),
            lx.data.Extraction("EMAIL", "laura@example.com"),
            lx.data.Extraction("EXPEDIENTE", "1234/2023"),
        ],
    ),
    lx.data.ExampleData(
        text=(
            'Autos: "PAZ, MARCOS DANIEL c/ ROJAS, ELENA s/ DAÑOS Y PERJUICIOS". El actor circulaba '
            "con su Fiat Cronos, dominio AC 987 ZX, cuando fue embestido por el rodado dominio "
            "AA123BB, asegurado en la póliza N° 7781-002345. Por la actora, el Dr. Hugo Lezcano, "
            "Matrícula N° 4.512, y el perito médico Lic. Ana Ríos, M.P. N° 990. "
            "Declaró la testigo Irma Funes, DNI 21.456.789, CUIL 27-21456789-3, "
            "domiciliada en calle Sarmiento N° 77, Barrio Norte, de la ciudad de Posadas."
        ),
        extractions=[
            lx.data.Extraction("PERSONA", "PAZ, MARCOS DANIEL"),
            lx.data.Extraction("PERSONA", "ROJAS, ELENA"),
            lx.data.Extraction("MATRICULA", "AC 987 ZX"),
            lx.data.Extraction("MATRICULA", "AA123BB"),
            lx.data.Extraction("POLIZA", "7781-002345"),
            lx.data.Extraction("PERSONA", "Hugo Lezcano"),
            lx.data.Extraction("MATRICULA_PROFESIONAL", "4.512"),
            lx.data.Extraction("PERSONA", "Ana Ríos"),
            lx.data.Extraction("MATRICULA_PROFESIONAL", "990"),
            lx.data.Extraction("PERSONA", "Irma Funes"),
            lx.data.Extraction("DNI", "21.456.789"),
            lx.data.Extraction("DNI", "27-21456789-3"),
            lx.data.Extraction("DOMICILIO", "calle Sarmiento N° 77, Barrio Norte"),
        ],
    ),
]


class LangExtractExtractor:
    def __init__(self, api_key: str, model_id: str = "gemini-3.5-flash-lite") -> None:
        self.api_key = api_key
        self.model_id = model_id

    def _extract_fragment(self, fragment: str) -> list[tuple[str, str]]:
        result = lx.extract(
            text_or_documents=fragment,
            prompt_description=PROMPT,
            examples=EXAMPLES,
            model_id=self.model_id,
            api_key=self.api_key,
            # Un fragmento = una llamada: el avance se cuenta por fragmentos terminados.
            max_char_buffer=FRAGMENT_CHARS,
            show_progress=False,
            language_model_params={"http_options": {"api_version": "v1beta"}},
        )
        return [(e.extraction_class, e.extraction_text) for e in result.extractions]

    def extract(
        self, text: str, on_progress: Callable[[int, int], None] | None = None
    ) -> list[Detection]:
        """Analiza los fragmentos en paralelo e informa cuántos terminaron.

        Si un fragmento falla, falla todo el análisis (el procesamiento lo reintenta entero).
        """
        fragments = split_into_fragments(text, FRAGMENT_CHARS)
        report = on_progress or (lambda _done, _total: None)
        report(0, len(fragments))
        pairs: list[tuple[str, str]] = []
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
            pending = [pool.submit(self._extract_fragment, f) for f in fragments]
            try:
                for done, future in enumerate(as_completed(pending), start=1):
                    pairs += future.result()
                    report(done, len(fragments))
            except BaseException:
                for future in pending:
                    future.cancel()
                raise
        # Las posiciones se calculan sobre el texto completo, no sobre cada fragmento.
        return align_extractions(text, pairs)

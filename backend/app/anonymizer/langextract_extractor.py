import langextract as lx

from app.anonymizer.markers import Detection

CATEGORIES = [
    "PERSONA", "DNI", "DOMICILIO", "TELEFONO", "EMAIL", "FECHA_NACIMIENTO",
    "MATRICULA", "CBU", "EXPEDIENTE", "SALUD", "MENOR",
]  # fmt: skip

PROMPT = (
    "Extraé del texto judicial argentino todos los datos sensibles, copiando el texto "
    "literal tal como aparece, sin parafrasear ni solapar. Categorías: "
    + ", ".join(CATEGORIES)
    + ". DNI incluye CUIL y CUIT. Las personas menores de edad van en MENOR, no en PERSONA. "
    "No extraigas roles procesales como 'el actor' o 'la demandada'."
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
    )
]


class LangExtractExtractor:
    def __init__(self, api_key: str, model_id: str = "gemini-2.5-flash") -> None:
        self.api_key = api_key
        self.model_id = model_id

    def extract(self, text: str) -> list[Detection]:
        result = lx.extract(
            text_or_documents=text,
            prompt_description=PROMPT,
            examples=EXAMPLES,
            model_id=self.model_id,
            api_key=self.api_key,
            language_model_params={"http_options": {"api_version": "v1beta"}},
        )
        detections = []
        for e in result.extractions:
            interval = e.char_interval
            if interval is None or interval.start_pos is None or interval.end_pos is None:
                continue
            detections.append(Detection(e.extraction_class, interval.start_pos, interval.end_pos))
        return detections

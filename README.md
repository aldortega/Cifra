# <img src="frontend/public/favicon.svg" alt="" width="32" height="32" align="absmiddle" /> Cifra

Anonimizador de documentos judiciales argentinos. Subís una sentencia o resolución (PDF o DOCX), Cifra detecta los datos personales y sensibles, vos revisás qué se oculta y descargás el documento anonimizado.

## Qué hace

- Detecta personas, DNI/CUIL/CUIT, domicilios, teléfonos, emails, fechas, patentes, matrículas profesionales, pólizas, CBU, expedientes, carátulas y datos de salud. Los menores se anonimizan siempre.
- Reemplaza cada dato por un marcador (`[PERSONA 1]`, `[DNI 2]`…). Todas las menciones de la misma persona, aunque varíen el orden o el título (Dr., Sra.), reciben el mismo marcador.
- Muestra el documento con su formato original para que confirmes, descartes o agregues detecciones antes de exportar.
- Exporta en el mismo formato del original, o convierte entre PDF y DOCX.
- Los archivos se borran automáticamente a las 24 horas, o antes si cancelás el trabajo.

## Cómo funciona

1. **Extracción de texto y formato.** Se lee el texto del PDF (PyMuPDF) o DOCX (python-docx), junto con su diseño de párrafos y estilos.
2. **Detección con LangExtract.** El texto se parte en fragmentos de párrafos que se analizan en paralelo con [LangExtract](https://github.com/google/langextract) y Gemini. LangExtract recibe una descripción de las categorías y ejemplos con formato de sentencias, y devuelve los datos como pares categoría–texto.
3. **Alineación propia.** El modelo solo devuelve el texto de cada dato; Cifra busca todas sus apariciones en el documento completo y calcula las posiciones. Así se cubren también las repeticiones que el modelo no marcó.
4. **Revisión.** Las detecciones quedan pendientes hasta que las confirmás en la pantalla de revisión.
5. **Reemplazo y verificación.** Se sustituyen los datos confirmados sobre el original y se comprueba que no quede ningún valor sin reemplazar antes de entregar el archivo.

## Estructura

- `frontend/`: Vite + React + TypeScript + HeroUI + Tailwind.
- `backend/`: FastAPI + ARQ (worker) + PostgreSQL + Redis, con LangExtract (Gemini), PyMuPDF y python-docx.

## Puesta en marcha

```sh
cp .env.example .env   # completar GEMINI_API_KEY
docker compose up
```

- Frontend: http://localhost:5173
- API: http://localhost:8000 (docs en `/docs`)

# Anon

Herramienta para ocultar datos sensibles en documentos judiciales argentinos, con revisión humana obligatoria antes de exportar.

## Language

**Anonimizar**:
Reemplazar cada dato sensible de un documento por un marcador de su categoría (p. ej. `[PERSONA]`, `[DNI]`), sin posibilidad de revertirlo desde el resultado.
_Avoid_: Redactar, enmascarar, pseudonimizar

**Documento**:
Archivo judicial (PDF con texto o DOCX) que se sube para ser anonimizado.
_Avoid_: Archivo, expediente

**Detección**:
Fragmento del documento que el sistema propone como dato sensible, con su categoría.
_Avoid_: Entidad, extracción, hallazgo

**Categoría**:
Tipo de dato sensible. Al subir un documento se elige cuáles categorías se anonimizan (persona, DNI/CUIL/CUIT, domicilio, teléfono, email, fecha de nacimiento, matrícula, CBU, número de expediente, salud, menor).
_Avoid_: Tipo, clase

**Marcador**:
Texto que sustituye a una detección confirmada en el documento exportado, determinado por su categoría. Todos llevan número (`[PERSONA 1]`, `[DNI 2]`), y el mismo valor recibe siempre el mismo número dentro del documento.
_Avoid_: Placeholder, etiqueta, token

**Mención**:
Cada aparición textual de una persona en el documento ("Juan Pérez", "J. Pérez", "el Sr. Pérez").
_Avoid_: Ocurrencia, alias

**Persona**:
Individuo único del documento que agrupa todas sus menciones y recibe un marcador numerado (`[PERSONA 1]`). El modelo propone el agrupamiento y quien revisa lo corrige.
_Avoid_: Entidad, individuo

**Rol procesal**:
Calidad en que alguien actúa en la causa ("el actor", "la demandada"); no identifica por sí solo y no se anonimiza.
_Avoid_: Carácter, parte

**Revisión**:
Paso obligatorio en el que una persona confirma, edita o descarta cada detección antes de poder exportar.
_Avoid_: Validación, aprobación

**Menor**:
Niño, niña o adolescente mencionado en el documento; categoría de tratamiento reforzado, siempre anonimizada.
_Avoid_: Niño, NNyA

import type { Deteccion } from "./types";

/** Clave de igualdad: sin tildes, mayúsculas ni puntuación. Igual criterio que el backend. */
export function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\W_]+/gu, " ")
    .trim();
}

/** Detecciones sin solapar: ante un solapamiento gana la que empieza antes y, a igual inicio, la más larga. */
export function sinSolapar(detecciones: Deteccion[]): Deteccion[] {
  const elegidas: Deteccion[] = [];
  let cursor = 0;
  for (const d of [...detecciones].sort((a, b) => a.inicio - b.inicio || b.fin - a.fin)) {
    if (d.inicio < cursor || d.fin <= d.inicio) continue;
    elegidas.push(d);
    cursor = d.fin;
  }
  return elegidas;
}

const CATEGORIAS_DE_PERSONAS = new Set(["PERSONA", "MENOR"]);
const TRATAMIENTOS = new Set([
  "dr",
  "dra",
  "dres",
  "sr",
  "sra",
  "srta",
  "ing",
  "lic",
  "cdor",
  "cdora",
  "prof",
  "don",
  "dona",
]);

/** Palabras del nombre sin tratamientos ni orden. Mismo criterio que el backend (markers.py). */
function palabrasDelNombre(valor: string): string[] {
  const palabras = normalizar(valor)
    .split(" ")
    .filter((p) => p && !TRATAMIENTOS.has(p));
  return [...new Set(palabras)].sort();
}

const contenido = (menor: string[], mayor: string[]) => menor.every((p) => mayor.includes(p));
const subconjuntoEstricto = (a: string[], b: string[]) => a.length < b.length && contenido(a, b);

/**
 * Clave de identidad de cada detección: las menciones de una misma persona comparten clave.
 * Un nombre contenido en el de una única persona (p. ej. solo el apellido) se une a ella.
 */
function clavesDeIdentidad(texto: string, detecciones: Deteccion[]): Map<string, string> {
  const claves = new Map<string, string>();
  const nombres = new Map<string, string[]>();
  for (const d of detecciones) {
    const valor = texto.slice(d.inicio, d.fin);
    const palabras = CATEGORIAS_DE_PERSONAS.has(d.categoria) ? palabrasDelNombre(valor) : [];
    if (palabras.length) nombres.set(d.id, palabras);
    else claves.set(d.id, normalizar(valor));
  }
  const distintos = [...new Map([...nombres.values()].map((n) => [n.join(" "), n])).values()];
  const completos = distintos.filter(
    (n) => !distintos.some((otro) => subconjuntoEstricto(n, otro)),
  );
  for (const [id, palabras] of nombres) {
    const [duenio, ...otros] = completos.filter((n) => contenido(palabras, n));
    claves.set(id, (duenio && otros.length === 0 ? duenio : palabras).join(" "));
  }
  return claves;
}

/** Vista previa del marcador de cada detección que se anonimizará, numerada por aparición. */
export function etiquetasDeMarcadores(
  texto: string,
  detecciones: Deteccion[],
): Map<string, string> {
  // Los menores se anonimizan siempre, aunque se hayan descartado (el servidor lo impone).
  // Como en el servidor, una detección contenida en otra (un nombre dentro de la carátula) no
  // genera marcador propio.
  const anonimizadas = sinSolapar(
    detecciones.filter((d) => d.estado === "confirmada" || d.categoria === "MENOR"),
  );
  const identidades = clavesDeIdentidad(texto, anonimizadas);
  const numeros = new Map<string, number>();
  const contadores = new Map<string, number>();
  const resultado = new Map<string, string>();
  for (const d of anonimizadas) {
    const clave = `${d.categoria}|${identidades.get(d.id)}`;
    if (!numeros.has(clave)) {
      const n = (contadores.get(d.categoria) ?? 0) + 1;
      contadores.set(d.categoria, n);
      numeros.set(clave, n);
    }
    resultado.set(d.id, `[${d.categoria} ${numeros.get(clave)}]`);
  }
  return resultado;
}

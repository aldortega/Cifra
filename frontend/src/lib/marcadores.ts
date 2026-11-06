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

/** Vista previa del marcador de cada detección confirmada, numerada por orden de aparición. */
export function etiquetasDeMarcadores(
  texto: string,
  detecciones: Deteccion[],
): Map<string, string> {
  const numeros = new Map<string, number>();
  const contadores = new Map<string, number>();
  const resultado = new Map<string, string>();
  const confirmadas = detecciones.filter((d) => d.estado === "confirmada");
  for (const d of [...confirmadas].sort((a, b) => a.inicio - b.inicio)) {
    const clave = `${d.categoria}|${normalizar(texto.slice(d.inicio, d.fin))}`;
    if (!numeros.has(clave)) {
      const n = (contadores.get(d.categoria) ?? 0) + 1;
      contadores.set(d.categoria, n);
      numeros.set(clave, n);
    }
    resultado.set(d.id, `[${d.categoria} ${numeros.get(clave)}]`);
  }
  return resultado;
}

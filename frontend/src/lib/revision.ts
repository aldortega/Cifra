import { normalizar, sinSolapar } from "./marcadores";
import type { Deteccion, EstadoDeteccion } from "./types";

export type Segmento = { inicio: number; fin: number; deteccion?: Deteccion };

/**
 * Parte el texto en tramos planos y tramos con detección; ignora detecciones solapadas.
 * Las descartadas solo ocupan huecos: si se descarta una carátula, se ven los nombres que contiene.
 */
export function construirSegmentos(texto: string, detecciones: Deteccion[]): Segmento[] {
  const vigentes = sinSolapar(detecciones.filter((d) => d.estado !== "descartada"));
  const descartadas = detecciones.filter(
    (d) => d.estado === "descartada" && !vigentes.some((v) => d.inicio < v.fin && v.inicio < d.fin),
  );
  const visibles = [...vigentes, ...sinSolapar(descartadas)].sort((a, b) => a.inicio - b.inicio);
  const out: Segmento[] = [];
  let cursor = 0;
  for (const d of visibles) {
    if (d.inicio > cursor) out.push({ inicio: cursor, fin: d.inicio });
    out.push({ inicio: d.inicio, fin: d.fin, deteccion: d });
    cursor = d.fin;
  }
  if (cursor < texto.length) out.push({ inicio: cursor, fin: texto.length });
  return out;
}

/** Clave que agrupa detecciones iguales: misma categoría y mismo valor normalizado. */
export function claveDeGrupo(texto: string, d: Deteccion): string {
  return `${d.categoria}|${normalizar(texto.slice(d.inicio, d.fin))}`;
}

export type Grupo = {
  clave: string;
  categoria: string;
  valor: string;
  detecciones: Deteccion[];
  /** Estado común; "mixto" si las apariciones difieren. */
  estado: EstadoDeteccion | "mixto";
};

/** Agrupa las detecciones por valor, en orden de primera aparición. */
export function agrupar(texto: string, detecciones: Deteccion[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const d of detecciones) {
    const clave = claveDeGrupo(texto, d);
    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave,
        categoria: d.categoria,
        valor: texto.slice(d.inicio, d.fin),
        detecciones: [],
        estado: d.estado,
      };
      grupos.set(clave, g);
    }
    g.detecciones.push(d);
    if (g.estado !== d.estado) g.estado = "mixto";
  }
  return [...grupos.values()];
}

export type Seleccion = { inicio: number; fin: number; texto: string; rect: DOMRect };

/** Posición en el texto completo de un punto de una selección del navegador. */
function desplazamiento(nodo: Node, offset: number): number | null {
  const elemento = nodo instanceof Element ? nodo : nodo.parentElement;
  const segmento = elemento?.closest<HTMLElement>("[data-offset]");
  if (!segmento || segmento.dataset.offset === undefined) return null;
  return Number(segmento.dataset.offset) + (nodo instanceof Element ? 0 : offset);
}

/** Lee la selección actual del navegador como tramo del texto completo, si es válida. */
export function leerSeleccion(texto: string): Seleccion | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const rango = sel.getRangeAt(0);
  const inicio = desplazamiento(rango.startContainer, rango.startOffset);
  const fin = desplazamiento(rango.endContainer, rango.endOffset);
  if (inicio === null || fin === null || fin <= inicio) return null;
  // Se recortan los espacios de los bordes, frecuentes al seleccionar con doble clic.
  const crudo = texto.slice(inicio, fin);
  const izquierda = crudo.length - crudo.trimStart().length;
  const contenido = crudo.trim();
  if (!contenido) return null;
  return {
    inicio: inicio + izquierda,
    fin: inicio + izquierda + contenido.length,
    texto: contenido,
    rect: rango.getBoundingClientRect(),
  };
}

/** Todas las apariciones literales de `valor` en el texto. */
export function apariciones(texto: string, valor: string): [number, number][] {
  const rangos: [number, number][] = [];
  for (let desde = 0; ;) {
    const i = texto.indexOf(valor, desde);
    if (i < 0) break;
    rangos.push([i, i + valor.length]);
    desde = i + valor.length;
  }
  return rangos;
}

import type { CSSProperties, ReactNode } from "react";

import { claseResaltado } from "@/lib/colores";
import { construirSegmentos } from "@/lib/revision";
import {
  type Alineacion,
  type Deteccion,
  type EstadoDeteccion,
  type Estilo,
  type FormatoDocx,
  type FormatoPdf,
  type ParrafoDocx,
  nombreCategoria,
} from "@/lib/types";

/** Ancho en píxeles de una hoja al 100 % de zoom. */
export const ANCHO_HOJA = 820;

const NOMBRE_ESTADO: Record<EstadoDeteccion, string> = {
  pendiente: "Sin revisar",
  confirmada: "Se anonimiza",
  descartada: "Descartada",
};

export type PropsVisor = {
  texto: string;
  formato?: FormatoPdf | FormatoDocx | null;
  /** Ordenadas por `inicio` y sin solaparse. */
  detecciones: Deteccion[];
  marcadores: Map<string, string>;
  vistaPrevia: boolean;
  seleccionadaId: string | null;
  /** Otras apariciones del grupo elegido, que se resaltan más suave. */
  delGrupo: Set<string>;
  zoom: number;
  alElegir: (id: string) => void;
};

/**
 * Muestra el documento con su formato original cuando el backend lo envía; si no, como texto.
 * Cada tramo de texto lleva `data-offset` con su posición en `texto`, para poder traducir una
 * selección del navegador a posiciones del texto completo.
 */
export function Visor(props: PropsVisor) {
  const ancho: CSSProperties = {
    width: `${Math.round(ANCHO_HOJA * props.zoom)}px`,
    maxWidth: props.zoom <= 1 ? "100%" : "none",
  };
  if (props.formato?.tipo === "pdf")
    return <VisorPdf {...props} formato={props.formato} ancho={ancho} />;
  if (props.formato?.tipo === "docx")
    return <VisorDocx {...props} formato={props.formato} ancho={ancho} />;
  return <VisorTexto {...props} ancho={ancho} />;
}

const HOJA =
  "mx-auto bg-white text-black shadow-[0_1px_3px_rgb(0_0_0/0.08),0_10px_30px_-12px_rgb(0_0_0/0.18)]";

// --- PDF: cada línea en su posición, escalada al ancho de la hoja ---------------------------

function VisorPdf(props: PropsVisor & { formato: FormatoPdf; ancho: CSSProperties }) {
  const { formato } = props;
  const porPagina = formato.paginas.map(() => [] as FormatoPdf["lineas"]);
  for (const linea of formato.lineas) porPagina[linea.pagina]?.push(linea);

  return (
    <div className="flex flex-col items-center gap-6">
      {formato.paginas.map((pagina, n) => (
        <div key={n} className="flex w-full flex-col items-center gap-1.5" style={props.ancho}>
          <div className={`${HOJA} w-full [container-type:inline-size]`}>
            <div
              className="relative overflow-hidden"
              style={
                {
                  aspectRatio: `${pagina.ancho} / ${pagina.alto}`,
                  "--pt": `calc(100cqw / ${pagina.ancho})`,
                } as CSSProperties
              }
            >
              {porPagina[n]?.map((linea) => (
                <div
                  key={linea.inicio}
                  className="absolute whitespace-pre"
                  style={posicionLinea(linea, pagina.ancho)}
                >
                  <Tramo {...props} inicio={linea.inicio} fin={linea.fin} escala="pt" />
                </div>
              ))}
            </div>
          </div>
          <span className="text-xs text-muted tabular-nums">
            Página {n + 1} de {formato.paginas.length}
          </span>
        </div>
      ))}
    </div>
  );
}

function posicionLinea(linea: FormatoPdf["lineas"][number], anchoPagina: number): CSSProperties {
  const pt = (valor: number) => `calc(var(--pt) * ${valor})`;
  const base: CSSProperties = {
    top: pt(linea.y0),
    height: pt(linea.y1 - linea.y0),
    lineHeight: pt(linea.y1 - linea.y0),
  };
  if (linea.alineacion === "centro") {
    return { ...base, left: pt((linea.x0 + linea.x1) / 2), transform: "translateX(-50%)" };
  }
  if (linea.alineacion === "derecha") return { ...base, right: pt(anchoPagina - linea.x1) };
  return { ...base, left: pt(linea.x0) };
}

// --- DOCX: párrafos con márgenes, sangrías, alineación y tablas -----------------------------

const ALINEACION_CSS: Record<Alineacion, CSSProperties["textAlign"]> = {
  izquierda: "left",
  centro: "center",
  derecha: "right",
  justificado: "justify",
};

const SECCIONES: { id: ParrafoDocx["seccion"]; nombre?: string }[] = [
  { id: "encabezado", nombre: "Encabezado" },
  { id: "cuerpo" },
  { id: "notas", nombre: "Notas" },
  { id: "pie", nombre: "Pie de página" },
];

function VisorDocx(props: PropsVisor & { formato: FormatoDocx; ancho: CSSProperties }) {
  const { pagina, parrafos } = props.formato;
  const pt = (valor: number) => `calc(var(--pt) * ${valor})`;

  return (
    <div className={`${HOJA} [container-type:inline-size]`} style={props.ancho}>
      <div
        className="flex flex-col"
        style={
          {
            "--pt": `calc(100cqw / ${pagina.ancho})`,
            padding: `${pt(pagina.margenSuperior)} ${pt(pagina.margenDerecho)} ${pt(pagina.margenInferior)} ${pt(pagina.margenIzquierdo)}`,
            minHeight: pt(pagina.alto),
          } as CSSProperties
        }
      >
        {SECCIONES.map(({ id, nombre }) => {
          const propios = parrafos.filter((p) => p.seccion === id);
          if (!propios.length) return null;
          const bloques = agruparTablas(propios);
          const contenido = bloques.map((b) =>
            Array.isArray(b) ? (
              <TablaDocx key={b[0]?.inicio} parrafos={b} visor={props} />
            ) : (
              <ParrafoConFormato key={b.inicio} parrafo={b} visor={props} />
            ),
          );
          if (!nombre) return <div key={id}>{contenido}</div>;
          const arriba = id === "encabezado";
          return (
            <section
              key={id}
              aria-label={nombre}
              className={`border-dashed border-black/15 ${arriba ? "mb-6 border-b pb-3" : "mt-8 border-t pt-3"}`}
            >
              <p className="mb-1 font-sans text-[10px] font-medium tracking-wider text-black/40 uppercase">
                {nombre}
              </p>
              {contenido}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Junta los párrafos consecutivos de una misma tabla en un arreglo. */
function agruparTablas(parrafos: ParrafoDocx[]): (ParrafoDocx | ParrafoDocx[])[] {
  const out: (ParrafoDocx | ParrafoDocx[])[] = [];
  for (const p of parrafos) {
    const ultimo = out.at(-1);
    if (p.celda && Array.isArray(ultimo) && ultimo[0]?.celda?.tabla === p.celda.tabla) {
      ultimo.push(p);
    } else out.push(p.celda ? [p] : p);
  }
  return out;
}

function TablaDocx({ parrafos, visor }: { parrafos: ParrafoDocx[]; visor: PropsVisor }) {
  const filas = new Map<number, Map<number, ParrafoDocx[]>>();
  let columnas = 0;
  for (const p of parrafos) {
    if (!p.celda) continue;
    const fila = filas.get(p.celda.fila) ?? new Map<number, ParrafoDocx[]>();
    filas.set(p.celda.fila, fila);
    fila.set(p.celda.columna, [...(fila.get(p.celda.columna) ?? []), p]);
    columnas = Math.max(columnas, p.celda.columna + 1);
  }
  return (
    <table className="my-2 w-full border-collapse">
      <tbody>
        {[...filas.entries()]
          .sort(([a], [b]) => a - b)
          .map(([n, celdas]) => (
            <tr key={n}>
              {Array.from({ length: columnas }, (_, c) => (
                <td key={c} className="border border-black/25 px-2 py-1 align-top">
                  {celdas.get(c)?.map((p) => (
                    <ParrafoConFormato key={p.inicio} parrafo={p} visor={visor} enCelda />
                  ))}
                </td>
              ))}
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function ParrafoConFormato(props: { parrafo: ParrafoDocx; visor: PropsVisor; enCelda?: boolean }) {
  const { parrafo: p, visor } = props;
  const pt = (valor: number) => `calc(var(--pt) * ${valor})`;
  return (
    <p
      style={{
        textAlign: ALINEACION_CSS[p.alineacion],
        marginLeft: pt(p.sangria),
        marginRight: pt(p.sangriaDerecha),
        textIndent: pt(p.primeraLinea),
        marginTop: pt(props.enCelda ? Math.min(p.espacioAntes, 4) : p.espacioAntes),
        lineHeight: p.interlineado,
      }}
    >
      <Tramo {...visor} inicio={p.inicio} fin={p.fin} escala="pt" />
    </p>
  );
}

// --- Sin formato: texto plano, como antes ----------------------------------------------------

function VisorTexto(props: PropsVisor & { ancho: CSSProperties }) {
  const segmentos = construirSegmentos(props.texto, props.detecciones);
  return (
    <div
      className={`${HOJA} px-6 py-10 font-serif text-[15.5px] leading-8 whitespace-pre-wrap sm:px-14 sm:py-16`}
      style={props.ancho}
    >
      {segmentos.map((s) =>
        s.deteccion ? (
          <MarcaDeteccion
            key={s.deteccion.id}
            visor={props}
            deteccion={s.deteccion}
            esInicio
            piezas={[{ inicio: s.inicio, fin: s.fin }]}
            escala="px"
          />
        ) : (
          <span key={s.inicio} data-offset={s.inicio}>
            {props.texto.slice(s.inicio, s.fin)}
          </span>
        ),
      )}
    </div>
  );
}

// --- Tramos con estilo y detecciones ---------------------------------------------------------

type Pieza = { inicio: number; fin: number; estilo?: Estilo };
type Escala = "pt" | "px";

/** Primer índice cuyo `fin` supera `posicion` (las listas están ordenadas y sin solaparse). */
function primeroDesde<T extends { fin: number }>(lista: T[], posicion: number): number {
  let bajo = 0;
  let alto = lista.length;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if ((lista[medio] as T).fin <= posicion) bajo = medio + 1;
    else alto = medio;
  }
  return bajo;
}

function estiloCss(estilo: Estilo | undefined, escala: Escala): CSSProperties {
  if (!estilo) return {};
  const generica = {
    serif: '"Times New Roman", Times, serif',
    sans: "Arial, Helvetica, sans-serif",
    mono: '"Courier New", monospace',
  }[estilo.familia];
  return {
    fontFamily: `"${estilo.fuente.replaceAll('"', "")}", ${generica}`,
    fontSize: escala === "pt" ? `calc(var(--pt) * ${estilo.tamano})` : undefined,
    fontWeight: estilo.negrita ? 700 : undefined,
    fontStyle: estilo.cursiva ? "italic" : undefined,
    textDecoration: estilo.subrayado ? "underline" : undefined,
  };
}

/** Texto entre `inicio` y `fin`, partido por estilos y por detecciones. */
function Tramo(props: PropsVisor & { inicio: number; fin: number; escala: Escala }) {
  const { inicio, fin, texto, detecciones, escala } = props;
  const estilos = props.formato?.estilos ?? [];

  // Puntos de corte: bordes del tramo, de cada estilo y de cada detección dentro de él.
  const cortes = new Set([inicio, fin]);
  for (let i = primeroDesde(estilos, inicio); i < estilos.length; i++) {
    const e = estilos[i] as Estilo;
    if (e.inicio >= fin) break;
    if (e.inicio > inicio) cortes.add(e.inicio);
    if (e.fin < fin) cortes.add(e.fin);
  }
  const propias: Deteccion[] = [];
  for (let i = primeroDesde(detecciones, inicio); i < detecciones.length; i++) {
    const d = detecciones[i] as Deteccion;
    if (d.inicio >= fin) break;
    if (propias.length && d.inicio < (propias.at(-1) as Deteccion).fin) continue;
    propias.push(d);
    if (d.inicio > inicio) cortes.add(d.inicio);
    if (d.fin < fin) cortes.add(d.fin);
  }
  const puntos = [...cortes].sort((a, b) => a - b);

  const nodos: ReactNode[] = [];
  let pendientes: Pieza[] = [];
  let actual: Deteccion | undefined;
  let iEstilo = primeroDesde(estilos, inicio);
  let iDet = 0;

  const cerrar = () => {
    if (actual && pendientes.length) {
      nodos.push(
        <MarcaDeteccion
          key={`d${pendientes[0]?.inicio}`}
          visor={props}
          deteccion={actual}
          esInicio={pendientes[0]?.inicio === actual.inicio}
          piezas={pendientes}
          escala={escala}
        />,
      );
    }
    pendientes = [];
  };

  for (let k = 0; k < puntos.length - 1; k++) {
    const desde = puntos[k] as number;
    const hasta = puntos[k + 1] as number;
    while (iEstilo < estilos.length && (estilos[iEstilo] as Estilo).fin <= desde) iEstilo++;
    const e = estilos[iEstilo];
    const estilo = e && e.inicio <= desde ? e : undefined;
    while (iDet < propias.length && (propias[iDet] as Deteccion).fin <= desde) iDet++;
    const p = propias[iDet];
    const det = p && p.inicio <= desde ? p : undefined;

    if (det !== actual) cerrar();
    actual = det;
    const pieza = { inicio: desde, fin: hasta, estilo };
    if (det) pendientes.push(pieza);
    else nodos.push(<PiezaTexto key={desde} pieza={pieza} texto={texto} escala={escala} />);
  }
  cerrar();
  return <>{nodos}</>;
}

function PiezaTexto({ pieza, texto, escala }: { pieza: Pieza; texto: string; escala: Escala }) {
  return (
    <span data-offset={pieza.inicio} style={estiloCss(pieza.estilo, escala)}>
      {texto.slice(pieza.inicio, pieza.fin)}
    </span>
  );
}

function MarcaDeteccion(props: {
  visor: PropsVisor;
  deteccion: Deteccion;
  /** El fragmento contiene el comienzo de la detección (puede continuar en otra línea). */
  esInicio: boolean;
  piezas: Pieza[];
  escala: Escala;
}) {
  const { visor, deteccion: d, esInicio, piezas, escala } = props;
  const marcador = visor.marcadores.get(d.id);
  const activa = d.id === visor.seleccionadaId;
  const anillo = activa
    ? "ring-2 ring-accent ring-offset-1 ring-offset-white"
    : visor.delGrupo.has(d.id)
      ? "ring-1 ring-accent/50"
      : "";

  let clase = claseResaltado(d.categoria, d.estado);
  let contenido: ReactNode = piezas.map((p) => (
    <PiezaTexto key={p.inicio} pieza={p} texto={visor.texto} escala={escala} />
  ));
  if (visor.vistaPrevia && marcador) {
    // El marcador ocupa el lugar de toda la detección: solo se muestra en su primer fragmento.
    if (!esInicio) return null;
    clase = "bg-black px-1 text-white no-underline";
    contenido = (
      <span style={estiloCss(piezas[0]?.estilo, escala)}>
        <span className="font-mono text-[0.8em]">{marcador}</span>
      </span>
    );
  } else if (visor.vistaPrevia && d.estado === "descartada") {
    clase = "hover:bg-black/5";
  }

  return (
    <button
      type="button"
      id={esInicio ? `det-${d.id}` : undefined}
      onClick={() => visor.alElegir(d.id)}
      title={`${nombreCategoria(d.categoria)} · ${NOMBRE_ESTADO[d.estado]}`}
      className={`inline cursor-pointer rounded-[3px] text-left transition-shadow ${clase} ${anillo}`}
    >
      {contenido}
    </button>
  );
}

import { Button, Card } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { etiquetasDeMarcadores, normalizar } from "@/lib/marcadores";
import { exportarTrabajo } from "@/lib/jobs";
import {
  CATEGORIAS,
  type Deteccion,
  type EstadoDeteccion,
  type FormatoExportacion,
  type Trabajo,
  nombreCategoria,
} from "@/lib/types";

const ESTILOS: Record<EstadoDeteccion, string> = {
  pendiente: "bg-warning/30 outline outline-1 outline-warning",
  confirmada: "bg-success/30 outline outline-1 outline-success",
  descartada: "bg-default/60 text-muted line-through",
};

type Seleccion = { inicio: number; fin: number; texto: string };

export function ReviewView({ trabajo }: { trabajo: Trabajo }) {
  const texto = trabajo.texto ?? "";
  const [detecciones, setDetecciones] = useState<Deteccion[]>(trabajo.detecciones ?? []);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [soloEsta, setSoloEsta] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [manual, setManual] = useState<Seleccion | null>(null);
  const [categoriaManual, setCategoriaManual] = useState("PERSONA");
  const [formato, setFormato] = useState<FormatoExportacion>("docx");

  const textoRef = useRef<HTMLElement>(null);
  const marcadores = useMemo(() => etiquetasDeMarcadores(texto, detecciones), [texto, detecciones]);
  const seleccionada = detecciones.find((d) => d.id === seleccionadaId) ?? null;
  const pendientes = detecciones.filter((d) => d.estado === "pendiente").length;

  const exportar = useMutation({
    mutationFn: () => exportarTrabajo(trabajo.id, formato, detecciones),
  });

  /** Detecciones a las que se aplica una acción: iguales en categoría y valor, salvo "solo esta". */
  function afectadas(base: Deteccion): Set<string> {
    if (soloEsta) return new Set([base.id]);
    const clave = normalizar(texto.slice(base.inicio, base.fin));
    return new Set(
      detecciones
        .filter(
          (d) =>
            d.categoria === base.categoria && normalizar(texto.slice(d.inicio, d.fin)) === clave,
        )
        .map((d) => d.id),
    );
  }

  function cambiar(base: Deteccion, cambios: Partial<Deteccion>) {
    const ids = afectadas(base);
    setDetecciones((previas) => previas.map((d) => (ids.has(d.id) ? { ...d, ...cambios } : d)));
  }

  function confirmarPendientes() {
    setDetecciones((previas) =>
      previas.map((d) => (d.estado === "pendiente" ? { ...d, estado: "confirmada" } : d)),
    );
  }

  function agregarManual() {
    if (!manual) return;
    const rangos: [number, number][] = [];
    if (soloEsta) rangos.push([manual.inicio, manual.fin]);
    else {
      for (let desde = 0; ;) {
        const i = texto.indexOf(manual.texto, desde);
        if (i < 0) break;
        rangos.push([i, i + manual.texto.length]);
        desde = i + manual.texto.length;
      }
    }
    setDetecciones((previas) => {
      const libres = rangos.filter(([a, b]) => !previas.some((d) => a < d.fin && b > d.inicio));
      const nuevas = libres.map(([inicio, fin]) => ({
        id: crypto.randomUUID(),
        categoria: categoriaManual,
        inicio,
        fin,
        estado: "confirmada" as const,
      }));
      return [...previas, ...nuevas].sort((a, b) => a.inicio - b.inicio);
    });
    setManual(null);
    window.getSelection()?.removeAllRanges();
  }

  // Captura la selección de texto hecha dentro del visor para marcarla a mano.
  useEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    const alSoltar = () => setManual(leerSeleccion(texto));
    el.addEventListener("mouseup", alSoltar);
    return () => el.removeEventListener("mouseup", alSoltar);
  }, [texto]);

  const segmentos = useMemo(() => construirSegmentos(texto, detecciones), [texto, detecciones]);

  if (exportar.isSuccess) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <Card.Header>
            <Card.Title>Documento anonimizado</Card.Title>
            <Card.Description>
              Descargalo ahora: el original se elimina al exportar.
            </Card.Description>
          </Card.Header>
          <Card.Footer className="gap-2">
            <a href={exportar.data.url} download={exportar.data.nombre}>
              <Button>Descargar {exportar.data.nombre}</Button>
            </a>
          </Card.Footer>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_20rem]">
      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Revisión</h1>
            <p className="text-sm text-muted">{trabajo.nombreArchivo}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={vistaPrevia}
              onChange={(e) => setVistaPrevia(e.target.checked)}
            />
            Vista previa anonimizada
          </label>
        </header>

        <article
          aria-label="Texto del documento"
          ref={textoRef}
          className="whitespace-pre-wrap rounded-xl border border-separator bg-surface p-5 text-sm leading-7"
        >
          {segmentos.map((s) =>
            s.deteccion ? (
              <DeteccionMarca
                key={s.inicio}
                segmento={s}
                texto={texto}
                vistaPrevia={vistaPrevia}
                marcador={marcadores.get(s.deteccion.id)}
                activa={s.deteccion.id === seleccionadaId}
                alElegir={() => setSeleccionadaId(s.deteccion?.id ?? null)}
              />
            ) : (
              <span key={s.inicio} data-offset={s.inicio}>
                {texto.slice(s.inicio, s.fin)}
              </span>
            ),
          )}
        </article>

        {manual && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-separator bg-surface p-3 text-sm">
            <span>
              Marcar «<strong>{manual.texto}</strong>» como
            </span>
            <SelectorCategoria valor={categoriaManual} alCambiar={setCategoriaManual} />
            <Button size="sm" onPress={agregarManual}>
              Agregar
            </Button>
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <Card>
          <Card.Header>
            <Card.Title>Detecciones</Card.Title>
            <Card.Description>
              {detecciones.length} en total, {pendientes} sin revisar.
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={soloEsta}
                onChange={(e) => setSoloEsta(e.target.checked)}
              />
              Aplicar solo a esta aparición
            </label>
            <Button
              size="sm"
              variant="secondary"
              onPress={confirmarPendientes}
              isDisabled={!pendientes}
            >
              Confirmar todas las pendientes
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>{seleccionada ? "Detección elegida" : "Elegí una detección"}</Card.Title>
            {!seleccionada && (
              <Card.Description>
                Hacé clic en un fragmento resaltado. También podés seleccionar texto para marcarlo a
                mano.
              </Card.Description>
            )}
          </Card.Header>
          {seleccionada && (
            <Card.Content className="flex flex-col gap-3 text-sm">
              <p className="break-words font-medium">
                «{texto.slice(seleccionada.inicio, seleccionada.fin)}»
              </p>
              <div className="flex flex-col gap-1">
                <span>Categoría</span>
                <SelectorCategoria
                  valor={seleccionada.categoria}
                  alCambiar={(categoria) => cambiar(seleccionada, { categoria })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onPress={() => cambiar(seleccionada, { estado: "confirmada" })}
                  isDisabled={seleccionada.estado === "confirmada"}
                >
                  Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => cambiar(seleccionada, { estado: "descartada" })}
                  isDisabled={seleccionada.estado === "descartada"}
                >
                  Descartar
                </Button>
              </div>
            </Card.Content>
          )}
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Exportar</Card.Title>
            <Card.Description>
              Se habilita cuando no quedan detecciones sin revisar.
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              Formato
              <select
                value={formato}
                onChange={(e) => setFormato(e.target.value as FormatoExportacion)}
                className="rounded-lg border border-separator bg-surface p-2"
              >
                <option value="docx">DOCX</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            {exportar.isError && (
              <p role="alert" className="text-danger">
                {exportar.error.message}
              </p>
            )}
            <Button
              isDisabled={pendientes > 0 || exportar.isPending}
              onPress={() => exportar.mutate()}
            >
              {exportar.isPending ? "Exportando…" : "Exportar documento"}
            </Button>
          </Card.Content>
        </Card>
      </aside>
    </main>
  );
}

function DeteccionMarca(props: {
  segmento: Segmento;
  texto: string;
  vistaPrevia: boolean;
  marcador?: string;
  activa: boolean;
  alElegir: () => void;
}) {
  const { segmento, texto, vistaPrevia, marcador, activa, alElegir } = props;
  const d = segmento.deteccion as Deteccion;
  const original = texto.slice(d.inicio, d.fin);
  const muestraMarcador = vistaPrevia && d.estado === "confirmada" && marcador;
  return (
    <button
      type="button"
      data-offset={segmento.inicio}
      onClick={alElegir}
      title={`${nombreCategoria(d.categoria)} · ${d.estado}`}
      className={`inline rounded px-0.5 text-left ${ESTILOS[d.estado]} ${activa ? "ring-2 ring-accent" : ""}`}
    >
      {muestraMarcador ? <strong>{marcador}</strong> : <Fragment>{original}</Fragment>}
    </button>
  );
}

function SelectorCategoria(props: { valor: string; alCambiar: (valor: string) => void }) {
  return (
    <select
      aria-label="Categoría"
      value={props.valor}
      onChange={(e) => props.alCambiar(e.target.value)}
      className="rounded-lg border border-separator bg-surface p-2"
    >
      {CATEGORIAS.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}

type Segmento = { inicio: number; fin: number; deteccion?: Deteccion };

/** Parte el texto en tramos planos y tramos con detección; ignora detecciones solapadas. */
function construirSegmentos(texto: string, detecciones: Deteccion[]): Segmento[] {
  const out: Segmento[] = [];
  let cursor = 0;
  for (const d of [...detecciones].sort((a, b) => a.inicio - b.inicio)) {
    if (d.inicio < cursor) continue;
    if (d.inicio > cursor) out.push({ inicio: cursor, fin: d.inicio });
    out.push({ inicio: d.inicio, fin: d.fin, deteccion: d });
    cursor = d.fin;
  }
  if (cursor < texto.length) out.push({ inicio: cursor, fin: texto.length });
  return out;
}

/** Posición en el texto completo de un punto de una selección del navegador. */
function desplazamiento(nodo: Node, offset: number): number | null {
  const elemento = nodo instanceof Element ? nodo : nodo.parentElement;
  const segmento = elemento?.closest<HTMLElement>("[data-offset]");
  if (!segmento || segmento.dataset.offset === undefined) return null;
  return Number(segmento.dataset.offset) + (nodo instanceof Element ? 0 : offset);
}

/** Lee la selección actual del navegador como tramo del texto completo, si es válida. */
function leerSeleccion(texto: string): Seleccion | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const rango = sel.getRangeAt(0);
  const inicio = desplazamiento(rango.startContainer, rango.startOffset);
  const fin = desplazamiento(rango.endContainer, rango.endOffset);
  if (inicio === null || fin === null || fin <= inicio) return null;
  const contenido = texto.slice(inicio, fin);
  return contenido.trim() ? { inicio, fin, texto: contenido } : null;
}

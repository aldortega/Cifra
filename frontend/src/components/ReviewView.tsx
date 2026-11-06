import { Button } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { paleta } from "@/lib/colores";
import { type FormatoSalida, exportarTrabajo } from "@/lib/jobs";
import { etiquetasDeMarcadores } from "@/lib/marcadores";
import {
  type Grupo,
  type Seleccion,
  agrupar,
  apariciones,
  claveDeGrupo,
  leerSeleccion,
} from "@/lib/revision";
import {
  CATEGORIAS,
  type Deteccion,
  type EstadoDeteccion,
  type Trabajo,
  nombreCategoria,
} from "@/lib/types";

import {
  IconoAbajo,
  IconoArriba,
  IconoCerrar,
  IconoCheck,
  IconoDescargar,
  IconoDescartar,
  IconoDocx,
  IconoFlechaDerecha,
  IconoPdf,
} from "./Iconos";
import { PantallaMensaje } from "./Marco";
import { ANCHO_HOJA, Visor } from "./Visor";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

export function ReviewView({ trabajo }: { trabajo: Trabajo }) {
  const texto = trabajo.texto ?? "";
  const [detecciones, setDetecciones] = useState<Deteccion[]>(() =>
    [...(trabajo.detecciones ?? [])].sort((a, b) => a.inicio - b.inicio),
  );
  // Al abrir, arranca por la primera pendiente.
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(
    () =>
      (trabajo.detecciones ?? [])
        .filter((d) => d.estado === "pendiente")
        .sort((a, b) => a.inicio - b.inicio)[0]?.id ?? null,
  );
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [manual, setManual] = useState<Seleccion | null>(null);
  const [categoriaManual, setCategoriaManual] = useState("PERSONA");
  /** Zoom elegido; `null` ajusta la hoja al ancho disponible. Arranca en 100 %. */
  const [zoomElegido, setZoomElegido] = useState<number | null>(1);
  const [anchoDocumento, setAnchoDocumento] = useState(ANCHO_HOJA);
  const [confirmandoTodas, setConfirmandoTodas] = useState(false);

  const documentoRef = useRef<HTMLDivElement>(null);
  const articuloRef = useRef<HTMLDivElement>(null);

  // Mide el ancho útil de la columna del documento para el zoom "Ajustar".
  useEffect(() => {
    const el = documentoRef.current;
    if (!el) return;
    const observador = new ResizeObserver(() => {
      const estilo = getComputedStyle(el);
      const relleno = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
      setAnchoDocumento(el.clientWidth - relleno);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  const zoom =
    zoomElegido ??
    Math.min(ZOOMS.at(-1) ?? 1, Math.max(ZOOMS[0] ?? 1, anchoDocumento / ANCHO_HOJA));

  const marcadores = useMemo(() => etiquetasDeMarcadores(texto, detecciones), [texto, detecciones]);
  const grupos = useMemo(() => agrupar(texto, detecciones), [texto, detecciones]);
  const seleccionada = detecciones.find((d) => d.id === seleccionadaId) ?? null;
  const grupoSeleccionado = seleccionada
    ? grupos.find((g) => g.clave === claveDeGrupo(texto, seleccionada))
    : undefined;
  const delGrupo = new Set(
    grupoSeleccionado?.detecciones.filter((d) => d !== seleccionada).map((d) => d.id),
  );

  const conteo = { pendiente: 0, confirmada: 0, descartada: 0 };
  for (const d of detecciones) conteo[d.estado]++;
  const revisadas = detecciones.length - conteo.pendiente;

  const exportar = useMutation({
    mutationFn: (salida: FormatoSalida) => exportarTrabajo(trabajo.id, detecciones, salida),
  });

  /** Elige una detección y, si se pide, la lleva a la vista en el documento. */
  function elegir(id: string | null, desplazar = false) {
    setSeleccionadaId(id);
    requestAnimationFrame(() => {
      if (id && desplazar) {
        document
          .getElementById(`det-${id}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  function siguientePendiente(lista: Deteccion[], desde: number): Deteccion | undefined {
    const pendientes = lista.filter((d) => d.estado === "pendiente");
    return pendientes.find((d) => d.inicio > desde) ?? pendientes[0];
  }

  /** Aplica cambios a un conjunto de detecciones y, al resolver, avanza a la siguiente pendiente. */
  function aplicar(ids: Set<string>, cambios: Partial<Deteccion>, desde: number, avanzar: boolean) {
    const nuevas = detecciones.map((d) => (ids.has(d.id) ? { ...d, ...cambios } : d));
    setDetecciones(nuevas);
    if (avanzar && cambios.estado) {
      const siguiente = siguientePendiente(nuevas, desde);
      if (siguiente) elegir(siguiente.id, true);
    }
  }

  /** Detecciones alcanzadas por una acción: todas las apariciones del mismo valor. */
  function alcance(base: Deteccion): Set<string> {
    const clave = claveDeGrupo(texto, base);
    return new Set(detecciones.filter((d) => claveDeGrupo(texto, d) === clave).map((d) => d.id));
  }

  function resolver(base: Deteccion, estado: EstadoDeteccion) {
    aplicar(alcance(base), { estado }, base.inicio, true);
  }

  function confirmarPendientes() {
    setConfirmandoTodas(false);
    setDetecciones((previas) =>
      previas.map((d) => (d.estado === "pendiente" ? { ...d, estado: "confirmada" } : d)),
    );
  }

  function agregarManual() {
    if (!manual) return;
    const rangos = apariciones(texto, manual.texto);
    const libres = rangos.filter(([a, b]) => !detecciones.some((d) => a < d.fin && b > d.inicio));
    const nuevas = libres.map(([inicio, fin]) => ({
      id: crypto.randomUUID(),
      categoria: categoriaManual,
      inicio,
      fin,
      estado: "confirmada" as const,
    }));
    setDetecciones([...detecciones, ...nuevas].sort((a, b) => a.inicio - b.inicio));
    const propia = nuevas.find((d) => d.inicio === manual.inicio);
    if (propia) setSeleccionadaId(propia.id);
    setManual(null);
    window.getSelection()?.removeAllRanges();
  }

  function mover(paso: 1 | -1) {
    if (!detecciones.length) return;
    const i = seleccionada ? detecciones.indexOf(seleccionada) : paso === 1 ? -1 : 0;
    const siguiente = detecciones[(i + paso + detecciones.length) % detecciones.length];
    if (siguiente) elegir(siguiente.id, true);
  }

  // Lleva a la vista la detección elegida al abrir.
  const alAbrir = useEffectEvent(() => {
    if (seleccionadaId)
      document.getElementById(`det-${seleccionadaId}`)?.scrollIntoView({ block: "center" });
  });
  useEffect(() => alAbrir(), []);

  // Atajos de teclado. useEffectEvent lee siempre el estado más reciente.
  const alPresionarTecla = useEffectEvent((e: KeyboardEvent) => {
    const destino = e.target as HTMLElement;
    if (destino.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const tecla = e.key.toLowerCase();
    if (tecla === "escape") {
      if (manual) setManual(null);
      else elegir(null);
    } else if (tecla === "j" || tecla === "arrowdown") mover(1);
    else if (tecla === "k" || tecla === "arrowup") mover(-1);
    else if (tecla === "n") {
      const siguiente = siguientePendiente(detecciones, seleccionada?.inicio ?? -1);
      if (siguiente) elegir(siguiente.id, true);
    } else if (tecla === "p") setVistaPrevia((v) => !v);
    else if (tecla === "x" && seleccionada) resolver(seleccionada, "confirmada");
    else if (tecla === "z" && seleccionada) resolver(seleccionada, "descartada");
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => alPresionarTecla(e);
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, []);

  // Captura la selección de texto hecha dentro del documento para marcarla a mano.
  useEffect(() => {
    const el = articuloRef.current;
    if (!el) return;
    const alSoltar = () => setManual(leerSeleccion(texto));
    el.addEventListener("mouseup", alSoltar);
    return () => el.removeEventListener("mouseup", alSoltar);
  }, [texto]);

  // Cierra la ventanita de marcado manual al hacer clic fuera de ella.
  useEffect(() => {
    if (!manual) return;
    const alPresionar = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-marcado-manual]")) setManual(null);
    };
    window.addEventListener("mousedown", alPresionar);
    return () => window.removeEventListener("mousedown", alPresionar);
  }, [manual]);

  if (exportar.isSuccess) {
    return <Exportado {...exportar.data} detecciones={detecciones} />;
  }

  const empezar = () => {
    const siguiente = siguientePendiente(detecciones, -1);
    if (siguiente) elegir(siguiente.id, true);
  };

  return (
    <div className="flex h-screen flex-col bg-surface-secondary/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-3">
          <p
            className="max-w-56 min-w-0 truncate text-sm font-medium"
            title={trabajo.nombreArchivo}
          >
            {trabajo.nombreArchivo}
          </p>
          <div className="flex rounded-lg bg-surface-secondary p-0.5 text-sm">
            {[false, true].map((valor) => (
              <button
                key={String(valor)}
                type="button"
                aria-pressed={vistaPrevia === valor}
                onClick={() => setVistaPrevia(valor)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  vistaPrevia === valor
                    ? "bg-surface font-medium shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {valor ? "Resultado" : "Original"}
              </button>
            ))}
          </div>
        </div>

        {/* Avance de la revisión, centrado. */}
        <div
          className="flex items-center gap-3 text-xs"
          title={`${revisadas} de ${detecciones.length} revisadas`}
        >
          <span
            className={`tabular-nums ${conteo.pendiente ? "text-muted" : "font-medium text-success"}`}
          >
            {conteo.pendiente ? `Faltan ${conteo.pendiente}` : "Revisión completa"}
          </span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-secondary">
            <div
              className={`h-full rounded-full transition-all duration-300 ${conteo.pendiente ? "bg-accent" : "bg-success"}`}
              style={{
                width: `${detecciones.length ? (revisadas / detecciones.length) * 100 : 100}%`,
              }}
            />
          </div>
        </div>

        <div className="ml-auto flex items-center justify-end gap-4 text-xs">
          {conteo.pendiente > 0 &&
            (confirmandoTodas ? (
              <span className="flex items-center gap-3">
                ¿Confirmar {conteo.pendiente} sin revisar?
                <button
                  type="button"
                  onClick={() => setConfirmandoTodas(false)}
                  className="text-muted hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarPendientes}
                  className="font-medium text-accent hover:underline"
                >
                  Confirmar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoTodas(true)}
                className="text-muted hover:text-foreground"
              >
                Confirmar todas
              </button>
            ))}
          <MenuExportar
            original={formatoOriginal(trabajo)}
            convertible={!!trabajo.formato}
            pendientes={conteo.pendiente}
            exportando={exportar.isPending}
            alExportar={(salida) => exportar.mutate(salida)}
          />
        </div>
        {exportar.isError && (
          <p role="alert" className="w-full text-right text-xs text-danger lg:col-span-3">
            No se pudo exportar: {exportar.error.message}
          </p>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={documentoRef}
          onScroll={() => manual && setManual(null)}
          className="h-full overflow-auto px-3 pt-2 pb-36 sm:px-8"
        >
          <div ref={articuloRef} role="document" aria-label="Documento">
            <Visor
              texto={texto}
              formato={trabajo.formato}
              detecciones={detecciones}
              marcadores={marcadores}
              vistaPrevia={vistaPrevia}
              seleccionadaId={seleccionadaId}
              delGrupo={delGrupo}
              zoom={zoom}
              alElegir={(id) => elegir(id)}
            />
          </div>
        </div>

        <div className="absolute bottom-5 left-5 z-30">
          <div className="flex h-10 items-center rounded-full border border-separator bg-surface px-1.5 text-sm text-muted shadow-lg">
            <button
              type="button"
              aria-label="Alejar"
              disabled={zoom <= (ZOOMS[0] ?? 1) + 0.001}
              onClick={() =>
                setZoomElegido([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? ZOOMS[0] ?? 1)
              }
              className="grid size-8 place-items-center rounded-full text-base transition hover:bg-surface-secondary hover:text-foreground active:scale-90 active:bg-default disabled:pointer-events-none disabled:opacity-30"
            >
              −
            </button>
            <button
              type="button"
              title="Ajustar al ancho"
              onClick={() => setZoomElegido(null)}
              className={`h-8 w-14 rounded-full text-center text-xs tabular-nums transition hover:bg-surface-secondary hover:text-foreground active:scale-95 active:bg-default ${zoomElegido === null ? "" : "text-foreground"}`}
            >
              {Math.round(zoom * 100)} %
            </button>
            <button
              type="button"
              aria-label="Acercar"
              disabled={zoom >= (ZOOMS.at(-1) ?? 1) - 0.001}
              onClick={() =>
                setZoomElegido(ZOOMS.find((z) => z > zoom + 0.001) ?? ZOOMS.at(-1) ?? 1)
              }
              className="grid size-8 place-items-center rounded-full text-base transition hover:bg-surface-secondary hover:text-foreground active:scale-90 active:bg-default disabled:pointer-events-none disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>

        <div className="absolute right-5 bottom-5 z-30">
          <Atajos />
        </div>

        {/* Acciones sobre la detección elegida, flotando sobre el documento. */}
        <div className="pointer-events-none absolute inset-x-4 bottom-5 flex justify-center">
          <div className="pointer-events-auto max-w-full">
            {seleccionada && grupoSeleccionado ? (
              <BarraDeteccion
                deteccion={seleccionada}
                grupo={grupoSeleccionado}
                texto={texto}
                alCambiarCategoria={(categoria) =>
                  aplicar(alcance(seleccionada), { categoria }, seleccionada.inicio, false)
                }
                alResolver={(estado) => resolver(seleccionada, estado)}
                alMover={mover}
                alCerrar={() => elegir(null)}
              />
            ) : conteo.pendiente > 0 ? (
              <Button className="shadow-lg" onPress={empezar}>
                Revisar {conteo.pendiente} pendientes <IconoFlechaDerecha />
              </Button>
            ) : (
              <p className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm shadow-lg">
                <IconoCheck className="text-success" /> Revisión completa
              </p>
            )}
          </div>
        </div>
      </div>

      {manual && (
        <MarcadoManual
          seleccion={manual}
          categoria={categoriaManual}
          alCambiarCategoria={setCategoriaManual}
          cantidad={apariciones(texto, manual.texto).length}
          alAgregar={agregarManual}
          alCancelar={() => setManual(null)}
        />
      )}
    </div>
  );
}

/** Fin: descarga el archivo apenas llega y resume qué se reemplazó. */
function Exportado(props: { nombre: string; url: string; detecciones: Deteccion[] }) {
  const { nombre, url, detecciones } = props;
  const enlace = useRef<HTMLAnchorElement>(null);
  const descargado = useRef(false);
  const liberacion = useRef<number | undefined>(undefined);

  // Descarga automática una sola vez (StrictMode monta los efectos dos veces en desarrollo).
  useEffect(() => {
    if (descargado.current) return;
    descargado.current = true;
    enlace.current?.click();
  }, []);

  // Libera la URL temporal al salir; se posterga para sobrevivir al remontaje de StrictMode.
  useEffect(() => {
    clearTimeout(liberacion.current);
    return () => {
      liberacion.current = window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }, [url]);

  // Lo que quedó reemplazado: confirmadas y menores, que nunca se descartan.
  const porCategoria = new Map<string, number>();
  for (const d of detecciones) {
    if (d.estado === "confirmada" || d.categoria === "MENOR")
      porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + 1);
  }
  const total = [...porCategoria.values()].reduce((a, b) => a + b, 0);
  const detalle = [...porCategoria]
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, n]) => `${n} ${nombreCategoria(categoria).toLowerCase()}`)
    .join(", ");

  return (
    <PantallaMensaje
      icono={<IconoCheck />}
      tono="exito"
      titulo="Documento anonimizado"
      detalle={
        <>
          <p>
            Se descargó <span className="font-medium break-all text-foreground">{nombre}</span>.
          </p>
          <p className="mt-1">Por privacidad, el original ya se borró del servidor.</p>
        </>
      }
    >
      <div className="flex flex-col items-center gap-5">
        {total > 0 && (
          <p className="rounded-xl bg-surface-secondary px-4 py-2.5 text-xs text-muted">
            Se reemplazaron {total} {total === 1 ? "dato" : "datos"}: {detalle}.
          </p>
        )}
        <div className="flex flex-col items-center gap-3">
          <a ref={enlace} href={url} download={nombre}>
            <Button variant="secondary">
              <IconoDescargar />
              Descargar de nuevo
            </Button>
          </a>
          <Link to="/" className="text-sm text-muted hover:text-foreground hover:underline">
            Anonimizar otro documento
          </Link>
        </div>
      </div>
    </PantallaMensaje>
  );
}

function formatoOriginal(trabajo: Trabajo): FormatoSalida {
  if (trabajo.formato) return trabajo.formato.tipo;
  return trabajo.nombreArchivo.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
}

const FORMATOS: Record<FormatoSalida, string> = {
  pdf: "PDF",
  docx: "Word (DOCX)",
};

/** Botón Exportar con un menú para elegir PDF o Word. */
function MenuExportar(props: {
  original: FormatoSalida;
  convertible: boolean;
  pendientes: number;
  exportando: boolean;
  alExportar: (salida: FormatoSalida) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("mousedown", alPresionar);
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("mousedown", alPresionar);
      window.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  const otro: FormatoSalida = props.original === "pdf" ? "docx" : "pdf";
  const opciones = [
    {
      salida: props.original,
      detalle: "Formato original: conserva el diseño exacto del documento.",
      deshabilitada: false,
    },
    {
      salida: otro,
      detalle: props.convertible
        ? "Convertido: se rearma con el texto y el formato detectado."
        : "No disponible para este documento.",
      deshabilitada: !props.convertible,
    },
  ];

  return (
    <div ref={contenedor} className="relative">
      <Button
        className="w-full"
        isDisabled={props.pendientes > 0 || props.exportando}
        onPress={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        <IconoDescargar />
        {props.exportando ? "Exportando…" : "Exportar"}
        <span aria-hidden="true" className="text-xs opacity-70">
          ▾
        </span>
      </Button>
      {abierto && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-2 w-72 rounded-xl border border-separator bg-surface p-1.5 shadow-xl"
        >
          <p className="px-2.5 pt-1.5 pb-2 text-xs text-muted">Descargar como</p>
          {opciones.map((o) => (
            <button
              key={o.salida}
              type="button"
              role="menuitem"
              disabled={o.deshabilitada}
              onClick={() => {
                setAbierto(false);
                props.alExportar(o.salida);
              }}
              className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {o.salida === "pdf" ? (
                <IconoPdf className="mt-0.5 size-7 shrink-0 text-danger" />
              ) : (
                <IconoDocx className="mt-0.5 size-7 shrink-0 text-accent" />
              )}
              <span>
                <span className="block text-sm font-medium">
                  {FORMATOS[o.salida]}
                  {o.salida === props.original && (
                    <span className="ml-1.5 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                      Recomendado
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted">{o.detalle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barra flotante para recorrer y resolver las detecciones. */
function BarraDeteccion(props: {
  deteccion: Deteccion;
  grupo: Grupo;
  texto: string;
  alCambiarCategoria: (categoria: string) => void;
  alResolver: (estado: EstadoDeteccion) => void;
  alMover: (paso: 1 | -1) => void;
  alCerrar: () => void;
}) {
  const { deteccion: d, grupo, texto } = props;
  const n = grupo.detecciones.length;
  const flecha =
    "grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground";

  return (
    <div className="flex max-w-full flex-wrap items-center gap-3 rounded-2xl border border-separator bg-surface p-2 shadow-xl">
      <div className="flex">
        <button
          type="button"
          aria-label="Anterior"
          title="Anterior (↑)"
          onClick={() => props.alMover(-1)}
          className={flecha}
        >
          <IconoArriba className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Siguiente"
          title="Siguiente (↓)"
          onClick={() => props.alMover(1)}
          className={flecha}
        >
          <IconoAbajo className="size-4" />
        </button>
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="flex items-baseline gap-1.5">
          <span
            className={`max-w-72 truncate text-sm font-medium ${d.estado === "descartada" ? "text-muted line-through" : ""}`}
            title={texto.slice(d.inicio, d.fin)}
          >
            {texto.slice(d.inicio, d.fin)}
          </span>
          {n > 1 && <span className="shrink-0 text-xs text-muted">×{n}</span>}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className={`size-2 shrink-0 rounded-full ${paleta(d.categoria).punto}`} />
          <SelectorCategoria
            valor={d.categoria}
            alCambiar={props.alCambiarCategoria}
            className="-ml-0.5 cursor-pointer bg-transparent outline-none hover:text-foreground"
          />
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => props.alResolver("descartada")}
          isDisabled={d.estado === "descartada"}
        >
          <IconoDescartar /> Descartar <Tecla>Z</Tecla>
        </Button>
        <Button
          size="sm"
          onPress={() => props.alResolver("confirmada")}
          isDisabled={d.estado === "confirmada"}
        >
          <IconoCheck /> Confirmar <Tecla>X</Tecla>
        </Button>
        <button
          type="button"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={props.alCerrar}
          className={flecha}
        >
          <IconoCerrar className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Botón que muestra los atajos de teclado en un desplegable. */
function Atajos() {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("mousedown", alPresionar);
    return () => window.removeEventListener("mousedown", alPresionar);
  }, [abierto]);

  const filas: [string[], string][] = [
    [["↑", "↓"], "Anterior / siguiente"],
    [["N"], "Siguiente pendiente"],
    [["Z"], "Descartar"],
    [["X"], "Confirmar"],
    [["P"], "Ver resultado"],
    [["Esc"], "Cerrar"],
  ];
  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-label="Atajos de teclado"
        title="Atajos de teclado"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`grid size-10 place-items-center rounded-full border border-separator bg-surface text-sm font-semibold shadow-lg transition-colors ${
          abierto ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        ?
      </button>
      {abierto && (
        <div className="absolute right-0 bottom-full z-40 mb-2 w-60 rounded-xl border border-separator bg-surface p-3 shadow-xl">
          <p className="mb-2 text-xs font-medium text-muted">Atajos de teclado</p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {filas.map(([teclas, accion]) => (
              <li key={accion} className="flex items-center justify-between">
                <span className="text-muted">{accion}</span>
                <span className="flex gap-1">
                  {teclas.map((t) => (
                    <Tecla key={t}>{t}</Tecla>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-separator pt-2 text-xs text-muted">
            Seleccioná texto en el documento para marcarlo a mano.
          </p>
        </div>
      )}
    </div>
  );
}

function Tecla({ children }: { children: string }) {
  return (
    <kbd className="inline-grid min-w-5 place-items-center rounded border border-separator bg-surface px-1 font-sans text-[10px] font-medium text-muted">
      {children}
    </kbd>
  );
}

function MarcadoManual(props: {
  seleccion: Seleccion;
  categoria: string;
  alCambiarCategoria: (v: string) => void;
  cantidad: number;
  alAgregar: () => void;
  alCancelar: () => void;
}) {
  const { rect } = props.seleccion;
  const ancho = 320;
  const izquierda = Math.min(
    Math.max(8, rect.left + rect.width / 2 - ancho / 2),
    window.innerWidth - ancho - 8,
  );
  // Debajo de la selección, o encima si no entra.
  const arriba = rect.bottom + 200 > window.innerHeight ? rect.top - 8 : rect.bottom + 8;
  const haciaArriba = rect.bottom + 200 > window.innerHeight;

  return (
    <section
      data-marcado-manual
      aria-label="Marcar texto a mano"
      style={{ left: izquierda, top: arriba, width: ancho }}
      className={`fixed z-40 flex flex-col gap-3 rounded-xl border border-separator bg-surface p-3 text-sm shadow-xl ${haciaArriba ? "-translate-y-full" : ""}`}
    >
      <p className="line-clamp-2 break-words">
        Marcar <strong>«{props.seleccion.texto}»</strong>
      </p>
      <SelectorCategoria valor={props.categoria} alCambiar={props.alCambiarCategoria} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={props.alCancelar}>
          Cancelar
        </Button>
        <Button size="sm" onPress={props.alAgregar}>
          Agregar{props.cantidad > 1 ? ` (${props.cantidad})` : ""}
        </Button>
      </div>
    </section>
  );
}

function SelectorCategoria(props: {
  valor: string;
  alCambiar: (valor: string) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="Categoría"
      value={props.valor}
      onChange={(e) => props.alCambiar(e.target.value)}
      className={
        props.className ??
        "w-full rounded-lg border border-separator bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent"
      }
    >
      {CATEGORIAS.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}

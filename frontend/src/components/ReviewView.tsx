import { Button } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { claseResaltado, paleta } from "@/lib/colores";
import { exportarTrabajo } from "@/lib/jobs";
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
  IconoBuscar,
  IconoCheck,
  IconoDescargar,
  IconoDescartar,
  IconoFlechaDerecha,
  IconoOjo,
} from "./Iconos";
import { BarraSuperior, PantallaMensaje } from "./Marco";
import { Visor } from "./Visor";

type Filtro = EstadoDeteccion | "todas";

const ZOOMS = [0.75, 1, 1.25, 1.5];

const NOMBRE_ESTADO: Record<EstadoDeteccion, string> = {
  pendiente: "Sin revisar",
  confirmada: "Se anonimiza",
  descartada: "Descartada",
};

export function ReviewView({ trabajo }: { trabajo: Trabajo }) {
  const texto = trabajo.texto ?? "";
  const [detecciones, setDetecciones] = useState<Deteccion[]>(() =>
    [...(trabajo.detecciones ?? [])].sort((a, b) => a.inicio - b.inicio),
  );
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [soloEsta, setSoloEsta] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [manual, setManual] = useState<Seleccion | null>(null);
  const [categoriaManual, setCategoriaManual] = useState("PERSONA");
  const [filtro, setFiltro] = useState<Filtro>(() =>
    trabajo.detecciones?.some((d) => d.estado === "pendiente") ? "pendiente" : "todas",
  );
  const [busqueda, setBusqueda] = useState("");
  const [zoom, setZoom] = useState(1);

  const documentoRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const articuloRef = useRef<HTMLDivElement>(null);

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
    mutationFn: () => exportarTrabajo(trabajo.id, detecciones),
  });

  /** Elige una detección y, si se pide, la lleva a la vista en el documento. */
  function elegir(id: string | null, desplazar = false) {
    setSeleccionadaId(id);
    requestAnimationFrame(() => {
      // Mantiene a la vista el grupo elegido en la lista lateral.
      listaRef.current
        ?.querySelector('[data-activo="true"]')
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  /** Detecciones alcanzadas por una acción: el grupo completo, salvo "solo esta". */
  function alcance(base: Deteccion): Set<string> {
    if (soloEsta) return new Set([base.id]);
    const clave = claveDeGrupo(texto, base);
    return new Set(detecciones.filter((d) => claveDeGrupo(texto, d) === clave).map((d) => d.id));
  }

  function resolver(base: Deteccion, estado: EstadoDeteccion) {
    aplicar(alcance(base), { estado }, base.inicio, true);
  }

  function resolverGrupo(g: Grupo, estado: EstadoDeteccion) {
    aplicar(
      new Set(g.detecciones.map((d) => d.id)),
      { estado },
      g.detecciones[0]?.inicio ?? 0,
      false,
    );
  }

  function confirmarPendientes() {
    setDetecciones((previas) =>
      previas.map((d) => (d.estado === "pendiente" ? { ...d, estado: "confirmada" } : d)),
    );
  }

  function agregarManual() {
    if (!manual) return;
    const rangos = soloEsta
      ? [[manual.inicio, manual.fin] as [number, number]]
      : apariciones(texto, manual.texto);
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
    else if (tecla === "c" && seleccionada) resolver(seleccionada, "confirmada");
    else if ((tecla === "d" || tecla === "x") && seleccionada) resolver(seleccionada, "descartada");
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

  const gruposVisibles = grupos.filter((g) => {
    const coincideEstado = filtro === "todas" || g.detecciones.some((d) => d.estado === filtro);
    const coincideTexto =
      !busqueda ||
      g.valor.toLowerCase().includes(busqueda.toLowerCase()) ||
      nombreCategoria(g.categoria).toLowerCase().includes(busqueda.toLowerCase());
    return coincideEstado && coincideTexto;
  });

  if (exportar.isSuccess) {
    return (
      <PantallaMensaje
        icono={<IconoCheck />}
        tono="exito"
        titulo="Documento anonimizado"
        detalle="Descargalo ahora: el original ya se eliminó del servidor y no vas a poder volver a exportarlo."
      >
        <div className="flex flex-col items-center gap-3">
          <a href={exportar.data.url} download={exportar.data.nombre}>
            <Button size="lg">
              <IconoDescargar />
              Descargar {exportar.data.nombre}
            </Button>
          </a>
          <Link to="/" className="text-sm text-muted hover:text-foreground hover:underline">
            Anonimizar otro documento
          </Link>
        </div>
      </PantallaMensaje>
    );
  }

  const progreso = detecciones.length ? (revisadas / detecciones.length) * 100 : 100;

  return (
    <div className="flex min-h-screen flex-col bg-background lg:h-screen">
      <BarraSuperior
        acciones={
          <>
            <div className="hidden w-48 flex-col gap-1 sm:flex">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Revisadas</span>
                <span className="font-medium tabular-nums">
                  {revisadas} / {detecciones.length}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${conteo.pendiente ? "bg-accent" : "bg-success"}`}
                  style={{ width: `${progreso}%` }}
                />
              </div>
            </div>
            <Button
              isDisabled={conteo.pendiente > 0 || exportar.isPending}
              onPress={() => exportar.mutate()}
            >
              <IconoDescargar />
              {exportar.isPending ? "Exportando…" : "Exportar"}
            </Button>
          </>
        }
      />

      {exportar.isError && (
        <p
          role="alert"
          className="border-b border-danger/30 bg-danger-soft px-6 py-2 text-sm text-danger"
        >
          No se pudo exportar: {exportar.error.message}
        </p>
      )}

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-0 lg:min-h-0 lg:grid-cols-[19rem_1fr_21rem]">
        {/* Lista de detecciones */}
        <aside className="flex flex-col border-separator lg:min-h-0 lg:border-r">
          <div className="flex flex-col gap-3 border-b border-separator p-4">
            <div>
              <h2 className="font-semibold">Detecciones</h2>
              <p className="text-xs text-muted">
                {grupos.length} valores distintos · {detecciones.length} apariciones
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-secondary p-1 text-xs">
              {(
                [
                  ["pendiente", "Pend.", conteo.pendiente],
                  ["confirmada", "Conf.", conteo.confirmada],
                  ["descartada", "Desc.", conteo.descartada],
                  ["todas", "Todas", detecciones.length],
                ] as const
              ).map(([id, nombre, n]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filtro === id}
                  onClick={() => setFiltro(id)}
                  className={`flex flex-col items-center rounded-md py-1 transition-colors ${
                    filtro === id
                      ? "bg-surface font-medium shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <span className="tabular-nums">{n}</span>
                  <span>{nombre}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-sm focus-within:border-accent">
              <IconoBuscar className="size-4 text-muted" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar valor o categoría"
                className="w-full bg-transparent outline-none placeholder:text-muted"
              />
            </label>
          </div>

          <ul ref={listaRef} className="flex-1 overflow-y-auto p-2 lg:min-h-0">
            {gruposVisibles.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-muted">
                {filtro === "pendiente" && !busqueda
                  ? "No quedan detecciones sin revisar."
                  : "Nada coincide con el filtro."}
              </li>
            )}
            {gruposVisibles.map((g) => (
              <FilaGrupo
                key={g.clave}
                grupo={g}
                activo={g.clave === grupoSeleccionado?.clave}
                marcador={g.detecciones[0] && marcadores.get(g.detecciones[0].id)}
                alElegir={() => {
                  // Clics sucesivos recorren las apariciones del grupo.
                  const i = seleccionada ? g.detecciones.indexOf(seleccionada) : -1;
                  const siguiente = g.detecciones[(i + 1) % g.detecciones.length];
                  if (siguiente) elegir(siguiente.id, true);
                }}
                alResolver={(estado) => resolverGrupo(g, estado)}
              />
            ))}
          </ul>

          {conteo.pendiente > 0 && (
            <div className="border-t border-separator p-3">
              <Button variant="secondary" className="w-full" onPress={confirmarPendientes}>
                <IconoCheck />
                Confirmar las {conteo.pendiente} pendientes
              </Button>
            </div>
          )}
        </aside>

        {/* Documento */}
        <section className="flex flex-col bg-surface-secondary/60 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator bg-background px-4 py-2.5">
            <p className="min-w-0 truncate text-sm font-medium" title={trabajo.nombreArchivo}>
              {trabajo.nombreArchivo}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg bg-surface-secondary p-1 text-sm">
                <button
                  type="button"
                  aria-label="Alejar"
                  disabled={zoom <= (ZOOMS[0] ?? 1)}
                  onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z)}
                  className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-12 text-center text-xs tabular-nums">
                  {Math.round(zoom * 100)} %
                </span>
                <button
                  type="button"
                  aria-label="Acercar"
                  disabled={zoom >= (ZOOMS.at(-1) ?? 1)}
                  onClick={() =>
                    setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)
                  }
                  className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <div className="flex rounded-lg bg-surface-secondary p-1 text-sm">
                {[false, true].map((valor) => (
                  <button
                    key={String(valor)}
                    type="button"
                    aria-pressed={vistaPrevia === valor}
                    onClick={() => setVistaPrevia(valor)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                      vistaPrevia === valor
                        ? "bg-surface font-medium shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {valor && <IconoOjo className="size-4" />}
                    {valor ? "Resultado" : "Original"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div
            ref={documentoRef}
            onScroll={() => manual && setManual(null)}
            className="flex-1 overflow-auto px-3 py-6 sm:px-8 lg:min-h-0"
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
            <p className="mt-4 text-center text-xs text-muted">
              Seleccioná cualquier fragmento del texto para marcarlo a mano.
            </p>
          </div>
        </section>

        {/* Inspector */}
        <aside className="flex flex-col gap-4 overflow-y-auto border-separator p-4 lg:min-h-0 lg:border-l">
          {seleccionada && grupoSeleccionado ? (
            <Inspector
              deteccion={seleccionada}
              grupo={grupoSeleccionado}
              texto={texto}
              marcador={marcadores.get(seleccionada.id)}
              soloEsta={soloEsta}
              alCambiarSoloEsta={setSoloEsta}
              alCambiarCategoria={(categoria) =>
                aplicar(alcance(seleccionada), { categoria }, seleccionada.inicio, false)
              }
              alResolver={(estado) => resolver(seleccionada, estado)}
              alCerrar={() => elegir(null)}
            />
          ) : (
            <SinSeleccion
              pendientes={conteo.pendiente}
              alEmpezar={() => {
                const siguiente = siguientePendiente(detecciones, -1);
                if (siguiente) elegir(siguiente.id, true);
              }}
            />
          )}
          <Atajos />
        </aside>
      </div>

      {manual && (
        <MarcadoManual
          seleccion={manual}
          categoria={categoriaManual}
          alCambiarCategoria={setCategoriaManual}
          cantidad={soloEsta ? 1 : apariciones(texto, manual.texto).length}
          soloEsta={soloEsta}
          alCambiarSoloEsta={setSoloEsta}
          alAgregar={agregarManual}
          alCancelar={() => setManual(null)}
        />
      )}
    </div>
  );
}

function FilaGrupo(props: {
  grupo: Grupo;
  activo: boolean;
  marcador?: string;
  alElegir: () => void;
  alResolver: (estado: EstadoDeteccion) => void;
}) {
  const { grupo: g, activo } = props;
  const n = g.detecciones.length;
  return (
    <li data-activo={activo} className="group relative">
      <button
        type="button"
        onClick={props.alElegir}
        className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
          activo ? "bg-accent-soft" : "hover:bg-surface-secondary"
        }`}
      >
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${paleta(g.categoria).punto}`} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-medium ${g.estado === "descartada" ? "text-muted line-through" : ""}`}
          >
            {g.valor}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {nombreCategoria(g.categoria)}
            {n > 1 && <span>· {n} apariciones</span>}
            {props.marcador && <span className="font-mono">· {props.marcador}</span>}
          </span>
        </span>
        <IndicadorEstado estado={g.estado} />
      </button>
      {/* Acciones rápidas sobre todo el grupo, al pasar el mouse. */}
      <span className="absolute top-1.5 right-1.5 hidden gap-1 rounded-md bg-surface p-0.5 shadow-sm group-hover:flex">
        <BotonIcono
          etiqueta="Confirmar todas las apariciones"
          onClick={() => props.alResolver("confirmada")}
          className="hover:bg-success-soft hover:text-success"
        >
          <IconoCheck />
        </BotonIcono>
        <BotonIcono
          etiqueta="Descartar todas las apariciones"
          onClick={() => props.alResolver("descartada")}
          className="hover:bg-danger-soft hover:text-danger"
        >
          <IconoDescartar />
        </BotonIcono>
      </span>
    </li>
  );
}

function IndicadorEstado({ estado }: { estado: Grupo["estado"] }) {
  const estilos = {
    pendiente: "border-2 border-dashed border-warning",
    confirmada: "bg-success text-success-foreground",
    descartada: "bg-default text-muted",
    mixto: "border-2 border-warning bg-warning-soft",
  };
  return (
    <span
      title={estado === "mixto" ? "Estados mezclados" : NOMBRE_ESTADO[estado]}
      className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${estilos[estado]}`}
    >
      {estado === "confirmada" && <IconoCheck />}
      {estado === "descartada" && <IconoDescartar />}
    </span>
  );
}

function BotonIcono(props: {
  etiqueta: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.etiqueta}
      title={props.etiqueta}
      onClick={props.onClick}
      className={`grid size-7 place-items-center rounded text-sm text-muted transition-colors ${props.className ?? ""}`}
    >
      {props.children}
    </button>
  );
}

function Inspector(props: {
  deteccion: Deteccion;
  grupo: Grupo;
  texto: string;
  marcador?: string;
  soloEsta: boolean;
  alCambiarSoloEsta: (v: boolean) => void;
  alCambiarCategoria: (categoria: string) => void;
  alResolver: (estado: EstadoDeteccion) => void;
  alCerrar: () => void;
}) {
  const { deteccion: d, grupo, texto, marcador } = props;
  const n = grupo.detecciones.length;
  const posicion = grupo.detecciones.indexOf(d) + 1;
  // Contexto: unas palabras antes y después de la aparición.
  const antes = texto.slice(Math.max(0, d.inicio - 70), d.inicio).replace(/^\S*\s/, "…");
  const despues = texto.slice(d.fin, d.fin + 70).replace(/\s\S*$/, "…");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-separator bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${paleta(d.categoria).chip}`}
        >
          {nombreCategoria(d.categoria)}
        </span>
        <button
          type="button"
          onClick={props.alCerrar}
          className="text-xs text-muted hover:text-foreground"
        >
          Cerrar <Tecla>Esc</Tecla>
        </button>
      </div>

      <div>
        <p className="break-words text-lg leading-snug font-semibold">
          {texto.slice(d.inicio, d.fin)}
        </p>
        <p className="mt-2 rounded-lg bg-surface-secondary p-2.5 font-serif text-xs leading-5 text-muted">
          {antes}
          <mark className="rounded-sm bg-accent-soft px-0.5 text-foreground">
            {texto.slice(d.inicio, d.fin)}
          </mark>
          {despues}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted">Estado</dt>
          <dd className="mt-0.5 font-medium">{NOMBRE_ESTADO[d.estado]}</dd>
        </div>
        <div>
          <dt className="text-muted">Marcador</dt>
          <dd className="mt-0.5 font-mono font-medium">
            {marcador ?? (d.estado === "pendiente" ? "Al confirmar" : "—")}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Categoría</span>
        <SelectorCategoria valor={d.categoria} alCambiar={props.alCambiarCategoria} />
      </div>

      {n > 1 && (
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-muted">
            Aplicar a · aparición {posicion} de {n}
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-secondary p-1">
            {[false, true].map((valor) => (
              <button
                key={String(valor)}
                type="button"
                aria-pressed={props.soloEsta === valor}
                onClick={() => props.alCambiarSoloEsta(valor)}
                className={`rounded-md py-1 transition-colors ${
                  props.soloEsta === valor ? "bg-surface font-medium shadow-sm" : "text-muted"
                }`}
              >
                {valor ? "Solo esta" : `Las ${n}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          onPress={() => props.alResolver("confirmada")}
          isDisabled={d.estado === "confirmada"}
          className="justify-between"
        >
          <span className="flex items-center gap-1.5">
            <IconoCheck /> Confirmar
          </span>
          <Tecla oscura>C</Tecla>
        </Button>
        <Button
          variant="secondary"
          onPress={() => props.alResolver("descartada")}
          isDisabled={d.estado === "descartada"}
          className="justify-between"
        >
          <span className="flex items-center gap-1.5">
            <IconoDescartar /> Descartar
          </span>
          <Tecla>D</Tecla>
        </Button>
      </div>
    </div>
  );
}

function SinSeleccion({ pendientes, alEmpezar }: { pendientes: number; alEmpezar: () => void }) {
  if (pendientes === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-success/30 bg-success-soft p-6 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-success text-xl text-success-foreground">
          <IconoCheck />
        </span>
        <div>
          <p className="font-semibold">Revisión completa</p>
          <p className="mt-1 text-sm text-muted">
            Activá «Resultado» para ver cómo queda, y exportá cuando quieras.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-separator bg-surface p-5">
      <p className="font-semibold">
        {pendientes} {pendientes === 1 ? "detección espera" : "detecciones esperan"} revisión
      </p>
      <p className="text-sm text-muted">
        Elegí un fragmento resaltado o empezá por la primera pendiente. Al confirmar o descartar
        pasás a la siguiente.
      </p>
      <Button onPress={alEmpezar}>
        Empezar revisión <IconoFlechaDerecha />
      </Button>
      <Leyenda />
    </div>
  );
}

function Leyenda() {
  return (
    <ul className="flex flex-col gap-2 border-t border-separator pt-3 text-xs">
      <li className="flex items-center gap-2">
        <span className={`rounded px-1.5 font-serif ${claseResaltado("PERSONA", "pendiente")}`}>
          Juan
        </span>
        <span className="text-muted">Sin revisar</span>
      </li>
      <li className="flex items-center gap-2">
        <span className={`rounded px-1.5 font-serif ${claseResaltado("PERSONA", "confirmada")}`}>
          Juan
        </span>
        <span className="text-muted">Se anonimiza</span>
      </li>
      <li className="flex items-center gap-2">
        <span className={`rounded px-1.5 font-serif ${claseResaltado("PERSONA", "descartada")}`}>
          Juan
        </span>
        <span className="text-muted">Descartada, queda visible</span>
      </li>
    </ul>
  );
}

function Atajos() {
  const filas: [string[], string][] = [
    [["J", "K"], "Siguiente / anterior"],
    [["N"], "Siguiente pendiente"],
    [["C"], "Confirmar"],
    [["D"], "Descartar"],
    [["P"], "Ver resultado"],
  ];
  return (
    <div className="mt-auto rounded-2xl p-1">
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
    </div>
  );
}

function Tecla({ children, oscura }: { children: string; oscura?: boolean }) {
  return (
    <kbd
      className={`inline-grid min-w-5 place-items-center rounded border px-1 font-sans text-[10px] font-medium ${
        oscura
          ? "border-white/30 text-current opacity-80"
          : "border-separator bg-surface text-muted"
      }`}
    >
      {children}
    </kbd>
  );
}

function MarcadoManual(props: {
  seleccion: Seleccion;
  categoria: string;
  alCambiarCategoria: (v: string) => void;
  cantidad: number;
  soloEsta: boolean;
  alCambiarSoloEsta: (v: boolean) => void;
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
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={!props.soloEsta}
          onChange={(e) => props.alCambiarSoloEsta(!e.target.checked)}
        />
        Todas las apariciones en el documento
      </label>
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

function SelectorCategoria(props: { valor: string; alCambiar: (valor: string) => void }) {
  return (
    <select
      aria-label="Categoría"
      value={props.valor}
      onChange={(e) => props.alCambiar(e.target.value)}
      className="w-full rounded-lg border border-separator bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent"
    >
      {CATEGORIAS.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}

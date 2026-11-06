import { Button } from "@heroui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { IconoAlerta, IconoCheck, IconoReloj } from "@/components/Iconos";
import { PantallaMensaje } from "@/components/Marco";
import { ReviewView } from "@/components/ReviewView";
import { cancelarTrabajo, obtenerTrabajo, reintentarTrabajo } from "@/lib/jobs";
import type { EstadoTrabajo, Progreso } from "@/lib/types";

export function JobPage() {
  const { id = "" } = useParams();
  const trabajo = useQuery({
    queryKey: ["trabajo", id],
    queryFn: () => obtenerTrabajo(id),
    // Consulta periódica mientras el documento se procesa.
    refetchInterval: (query) =>
      query.state.data && ["subido", "procesando"].includes(query.state.data.estado) ? 1500 : false,
    refetchOnWindowFocus: false,
  });

  const navigate = useNavigate();
  const cancelar = useMutation({
    mutationFn: () => cancelarTrabajo(id),
    onSuccess: () => navigate("/"),
  });

  const reintentar = useMutation({
    mutationFn: () => reintentarTrabajo(id),
    onSuccess: () => trabajo.refetch(),
  });

  if (trabajo.isPending) return <Procesando estado="subido" />;
  if (trabajo.isError) {
    return (
      <PantallaMensaje
        icono={<IconoAlerta />}
        tono="error"
        titulo="No se pudo consultar el trabajo"
        detalle={trabajo.error.message}
      >
        <Volver />
      </PantallaMensaje>
    );
  }

  const t = trabajo.data;
  switch (t.estado) {
    case "subido":
    case "procesando":
      return (
        <Procesando
          estado={t.estado}
          nombre={t.nombreArchivo}
          progreso={t.progreso}
          cancelando={cancelar.isPending}
          errorAlCancelar={cancelar.error?.message}
          alCancelar={() => cancelar.mutate()}
        />
      );
    case "en_revision":
      return <ReviewView trabajo={t} />;
    case "fallido":
      return (
        <PantallaMensaje
          icono={<IconoAlerta />}
          tono="error"
          titulo="El procesamiento falló"
          detalle={t.error}
        >
          <div className="flex justify-center gap-2">
            <Button isDisabled={reintentar.isPending} onPress={() => reintentar.mutate()}>
              {reintentar.isPending ? "Reintentando…" : "Reintentar"}
            </Button>
            <Volver variante="secondary" />
          </div>
        </PantallaMensaje>
      );
    case "exportado":
      return (
        <PantallaMensaje
          icono={<IconoCheck />}
          tono="exito"
          titulo="Documento exportado"
          detalle="El original ya fue eliminado del servidor."
        >
          <Volver />
        </PantallaMensaje>
      );
    case "vencido":
      return (
        <PantallaMensaje
          icono={<IconoReloj />}
          titulo="El trabajo venció o no existe"
          detalle="Los documentos se eliminan a las 24 horas."
        >
          <Volver />
        </PantallaMensaje>
      );
  }
}

function Volver({ variante }: { variante?: "secondary" }) {
  return (
    <Link to="/">
      <Button variant={variante}>Subir otro documento</Button>
    </Link>
  );
}

/** Tiempo supuesto por fragmento hasta medir el primero real. */
const FRAGMENTO_ESTIMADO_MS = 12_000;
const DEMORA_NORMAL_MS = 60_000;

function Procesando(props: {
  estado: EstadoTrabajo;
  nombre?: string;
  progreso?: Progreso | null;
  cancelando?: boolean;
  errorAlCancelar?: string;
  alCancelar?: () => void;
}) {
  const { estado, nombre, progreso } = props;
  const hechos = progreso?.hechos ?? null;

  // Reloj interno: registra cuándo empezó el análisis y cuándo avanzó por última vez, para
  // estimar el ritmo y mover la barra entre un fragmento y el siguiente.
  const [reloj, setReloj] = useState(() => {
    const ahora = Date.now();
    return {
      ahora,
      montado: ahora,
      hechos,
      cambio: ahora,
      inicioAnalisis: hechos === null ? 0 : ahora,
    };
  });
  const tic = useEffectEvent(() =>
    setReloj((previo) => {
      const ahora = Date.now();
      if (hechos === previo.hechos) return { ...previo, ahora };
      return {
        ...previo,
        ahora,
        hechos,
        cambio: ahora,
        inicioAnalisis: previo.hechos === null ? ahora : previo.inicioAnalisis,
      };
    }),
  );
  useEffect(() => {
    const intervalo = setInterval(tic, 200);
    return () => clearInterval(intervalo);
  }, []);

  let porcentaje: number;
  let etapa: string;
  if (estado === "subido") {
    porcentaje = 2;
    etapa = "Recibiendo el documento…";
  } else if (!progreso?.total || reloj.hechos === null) {
    porcentaje = 5;
    etapa = "Leyendo el documento…";
  } else {
    const ritmo =
      reloj.hechos > 0
        ? (reloj.cambio - reloj.inicioAnalisis) / reloj.hechos
        : FRAGMENTO_ESTIMADO_MS;
    // Avanza hasta el 90 % del tramo que falta para el próximo fragmento, nunca más.
    const parcial = Math.min(0.9, (reloj.ahora - reloj.cambio) / Math.max(ritmo, 1));
    const fraccion = Math.min(1, (reloj.hechos + parcial) / progreso.total);
    porcentaje = 8 + 92 * fraccion;
    etapa = "Buscando datos sensibles…";
  }
  const demorado = reloj.ahora - reloj.montado > DEMORA_NORMAL_MS;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-center text-lg font-semibold tracking-tight">
          Procesando {nombre ? <span className="break-all">{nombre}</span> : "el documento"}
        </h1>

        <div className="flex flex-col gap-2">
          <progress
            aria-label="Avance del procesamiento"
            value={porcentaje}
            max={100}
            className="h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-surface-secondary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300"
          />
          <div className="flex justify-between text-sm text-muted">
            <span>{etapa}</span>
            <span className="tabular-nums">{Math.round(porcentaje)} %</span>
          </div>
        </div>

        <p className="text-center text-xs text-muted">
          {demorado ? "Está tardando más de lo normal…" : "Suele tardar menos de un minuto."}
        </p>

        <p className="rounded-xl bg-surface-secondary px-4 py-3 text-center text-xs text-muted">
          Mientras tanto: <Tecla>X</Tecla> confirma, <Tecla>Z</Tecla> descarta y <Tecla>↑</Tecla>{" "}
          <Tecla>↓</Tecla> te mueven entre los datos.
        </p>

        {props.alCancelar && (
          <div className="flex flex-col items-center gap-1 text-xs">
            <button
              type="button"
              disabled={props.cancelando}
              onClick={props.alCancelar}
              className="text-muted hover:text-foreground hover:underline disabled:opacity-60"
            >
              {props.cancelando ? "Cancelando…" : "Cancelar y subir otro documento"}
            </button>
            {props.errorAlCancelar && (
              <p role="alert" className="text-danger">
                No se pudo cancelar: {props.errorAlCancelar}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tecla({ children }: { children: string }) {
  return (
    <kbd className="mx-0.5 inline-grid min-w-5 place-items-center rounded border border-separator bg-surface px-1 font-sans text-[10px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

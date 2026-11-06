import { Button } from "@heroui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { IconoAlerta, IconoCheck, IconoReloj } from "@/components/Iconos";
import { PantallaMensaje } from "@/components/Marco";
import { ReviewView } from "@/components/ReviewView";
import { obtenerTrabajo, reintentarTrabajo } from "@/lib/jobs";
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
      return <Procesando estado={t.estado} nombre={t.nombreArchivo} progreso={t.progreso} />;
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

const PASOS = ["Documento recibido", "Leyendo el documento", "Detectando datos sensibles"];

function Procesando(props: { estado: EstadoTrabajo; nombre?: string; progreso?: Progreso | null }) {
  const { estado, nombre, progreso } = props;
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const intervalo = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(intervalo);
  }, []);

  // Paso real informado por el backend: sin avance todavía, el worker está leyendo el documento.
  const actual = estado === "subido" ? 0 : progreso ? 2 : 1;
  const porcentaje = progreso?.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0;

  return (
    <PantallaMensaje
      icono={
        <span className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      }
      titulo="Procesando el documento"
      detalle={
        <>
          {nombre && <span className="font-medium text-foreground">{nombre}</span>}
          {nombre && " · "}
          {segundos} s
        </>
      }
    >
      <ol className="flex flex-col gap-1 rounded-2xl border border-separator bg-surface p-3 text-left text-sm">
        {PASOS.map((paso, i) => (
          <li
            key={paso}
            className={`flex flex-col gap-2 rounded-lg px-2 py-2 ${i === actual ? "bg-surface-secondary" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full text-xs ${
                  i < actual
                    ? "bg-success text-success-foreground"
                    : i === actual
                      ? "border-2 border-accent border-t-transparent animate-spin"
                      : "border border-separator"
                }`}
              >
                {i < actual && <IconoCheck className="size-3" />}
              </span>
              <span className={`flex-1 ${i > actual ? "text-muted" : "font-medium"}`}>{paso}</span>
              {i === 2 && progreso && (
                <span className="text-xs tabular-nums text-muted">
                  {progreso.hechos} de {progreso.total} fragmentos · {porcentaje} %
                </span>
              )}
            </div>
            {i === 2 && progreso && (
              <progress
                aria-label="Avance del análisis"
                value={porcentaje}
                max={100}
                className="ml-8 h-1.5 w-[calc(100%-2rem)] appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-background [&::-webkit-progress-value]:bg-accent [&::-webkit-progress-value]:transition-all"
              />
            )}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted">Suele tardar menos de un minuto.</p>
    </PantallaMensaje>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router";

import { IconoEscudo, IconoReloj } from "./Iconos";

/** Barra superior común a todas las pantallas. `acciones` ocupa el lado derecho. */
export function BarraSuperior({ acciones }: { acciones?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-separator bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <IconoEscudo className="size-5" />
          </span>
          Anon
        </Link>
        <span className="hidden items-center gap-1.5 text-xs text-muted md:flex">
          <IconoReloj className="size-3.5" />
          Los documentos se eliminan a las 24 horas
        </span>
        <div className="ml-auto flex items-center gap-2">{acciones}</div>
      </div>
    </header>
  );
}

/** Pantalla centrada con un mensaje: estados de carga, error y fin. */
export function PantallaMensaje(props: {
  icono: ReactNode;
  tono?: "neutro" | "exito" | "error";
  titulo: string;
  detalle?: ReactNode;
  children?: ReactNode;
}) {
  const tonos = {
    neutro: "bg-surface-secondary text-foreground",
    exito: "bg-success-soft text-success",
    error: "bg-danger-soft text-danger",
  };
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BarraSuperior />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div
            className={`mb-5 grid size-14 place-items-center rounded-2xl text-2xl ${tonos[props.tono ?? "neutro"]}`}
          >
            {props.icono}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{props.titulo}</h1>
          {props.detalle && <div className="mt-2 text-sm text-muted">{props.detalle}</div>}
          {props.children && <div className="mt-6 w-full">{props.children}</div>}
        </div>
      </main>
    </div>
  );
}

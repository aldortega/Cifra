import type { ReactNode } from "react";
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

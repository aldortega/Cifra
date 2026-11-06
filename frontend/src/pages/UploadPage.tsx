import { Button, Label, Switch } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { type DragEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  IconoArchivo,
  IconoCandado,
  IconoCerrar,
  IconoFlechaDerecha,
  IconoSubir,
} from "@/components/Iconos";
import { paleta } from "@/lib/colores";
import { crearTrabajo } from "@/lib/jobs";
import { CATEGORIAS } from "@/lib/types";

const EXTENSIONES = [".pdf", ".docx"];

function tamanio(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const esBloqueada = (c: (typeof CATEGORIAS)[number]) => "bloqueada" in c && c.bloqueada;

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [activas, setActivas] = useState(
    () => new Set<string>(CATEGORIAS.filter((c) => c.porDefecto).map((c) => c.id)),
  );

  const subir = useMutation({
    mutationFn: () => crearTrabajo(archivo as File, [...activas]),
    onSuccess: ({ id }) => navigate(`/trabajos/${id}`),
  });

  function elegir(nuevo: File | undefined) {
    if (!nuevo) return;
    const valido = EXTENSIONES.some((ext) => nuevo.name.toLowerCase().endsWith(ext));
    if (!valido) {
      setErrorArchivo("Solo se aceptan archivos PDF o DOCX.");
      return;
    }
    setErrorArchivo(null);
    setArchivo(nuevo);
  }

  function alSoltar(e: DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    elegir(e.dataTransfer.files[0]);
  }

  function alternar(id: string) {
    setActivas((previas) => {
      const siguientes = new Set(previas);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  const opcionales = CATEGORIAS.filter((c) => !esBloqueada(c));
  const todasActivas = opcionales.every((c) => activas.has(c.id));
  const cantidadActivas = opcionales.filter((c) => activas.has(c.id)).length;

  const arrastre = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setArrastrando(true);
    },
    onDragLeave: () => setArrastrando(false),
    onDrop: alSoltar,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-16">
        <section aria-labelledby="paso-documento" className="flex flex-col gap-3">
          <Paso numero={1} id="paso-documento" titulo="Documento" />
          <input
            ref={inputRef}
            type="file"
            accept={EXTENSIONES.join(",")}
            className="hidden"
            onChange={(e) => {
              elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {archivo && !arrastrando ? (
            <div
              {...arrastre}
              className="flex min-h-24 items-center gap-4 rounded-2xl border border-separator bg-surface px-5 py-4 shadow-sm"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-2xl text-accent">
                <IconoArchivo />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{archivo.name}</p>
                <p className="text-sm text-muted">
                  {archivo.name.split(".").pop()?.toUpperCase()} · {tamanio(archivo.size)}
                </p>
              </div>
              <Button size="sm" variant="ghost" onPress={() => inputRef.current?.click()}>
                Cambiar
              </Button>
              <button
                type="button"
                aria-label="Quitar archivo"
                onClick={() => setArchivo(null)}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground"
              >
                <IconoCerrar className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              {...arrastre}
              className={`group flex min-h-24 items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-4 text-left transition-colors ${
                arrastrando
                  ? "border-accent bg-accent-soft"
                  : "border-separator bg-surface hover:border-accent/60 hover:bg-surface-secondary"
              }`}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-secondary text-2xl text-muted transition-colors group-hover:text-accent">
                <IconoSubir />
              </span>
              <span className="flex flex-col">
                <span className="font-medium">
                  {arrastrando
                    ? "Soltá el archivo acá"
                    : "Arrastrá el archivo o hacé clic para elegirlo"}
                </span>
                <span className="text-sm text-muted">PDF con texto o DOCX · hasta 20 páginas</span>
              </span>
            </button>
          )}
          {errorArchivo && (
            <p role="alert" className="text-sm text-danger">
              {errorArchivo}
            </p>
          )}
        </section>

        <section aria-labelledby="paso-categorias" className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <Paso
              numero={2}
              id="paso-categorias"
              titulo="Qué datos ocultar"
              detalle={`${cantidadActivas} de ${opcionales.length} categorías activas`}
            />
            <button
              type="button"
              className="text-sm leading-6 font-medium text-accent hover:underline"
              onClick={() =>
                setActivas(todasActivas ? new Set() : new Set(opcionales.map((c) => c.id)))
              }
            >
              {todasActivas ? "Quitar todas" : "Activar todas"}
            </button>
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-surface-secondary px-4 py-2.5 text-sm text-muted">
            <IconoCandado className="size-4 shrink-0" />
            Los datos de menores siempre se anonimizan.
          </p>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-separator bg-separator sm:grid-cols-2 lg:grid-cols-3">
            {opcionales.map((categoria) => {
              const activa = activas.has(categoria.id);
              return (
                <li key={categoria.id} className="bg-surface">
                  <Switch
                    isSelected={activa}
                    onChange={() => alternar(categoria.id)}
                    className="flex h-full w-full"
                  >
                    <Switch.Content className="flex h-full w-full items-center gap-3 px-4 py-3">
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${activa ? paleta(categoria.id).punto : "bg-separator"}`}
                      />
                      <Label className={`flex-1 text-sm ${activa ? "" : "text-muted"}`}>
                        {categoria.nombre}
                      </Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-3">
          {subir.isError && (
            <p role="alert" className="text-sm text-danger">
              {subir.error.message}
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            isDisabled={!archivo || subir.isPending}
            onPress={() => subir.mutate()}
          >
            {subir.isPending ? "Subiendo…" : "Procesar documento"}
            {!subir.isPending && <IconoFlechaDerecha />}
          </Button>
        </div>
      </main>
    </div>
  );
}

function Paso(props: { numero: number; id: string; titulo: string; detalle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
        {props.numero}
      </span>
      <div>
        <h2 id={props.id} className="font-semibold">
          {props.titulo}
        </h2>
        {props.detalle && <p className="text-xs text-muted">{props.detalle}</p>}
      </div>
    </div>
  );
}

import { Button } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { type DragEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  IconoArchivo,
  IconoCandado,
  IconoCerrar,
  IconoCheck,
  IconoFlechaDerecha,
  IconoSubir,
} from "@/components/Iconos";
import { BarraSuperior } from "@/components/Marco";
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
  const cantidadActivas = CATEGORIAS.filter((c) => esBloqueada(c) || activas.has(c.id)).length;

  return (
    <div className="min-h-screen bg-background">
      <BarraSuperior />

      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_18rem] lg:py-16">
        <div className="flex flex-col gap-8">
          <header className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Anonimizá un documento judicial
            </h1>
            <p className="mt-3 text-base text-muted">
              Detectamos los datos sensibles, vos revisás cada uno y descargás el documento con los
              datos reemplazados por marcadores como <Marcador>[PERSONA 1]</Marcador> o{" "}
              <Marcador>[DNI 2]</Marcador>.
            </p>
          </header>

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
            {archivo ? (
              <div className="flex items-center gap-4 rounded-2xl border border-separator bg-surface p-4 shadow-sm">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-2xl text-accent">
                  <IconoArchivo />
                </div>
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
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground"
                >
                  <IconoCerrar className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={alSoltar}
                className={`group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  arrastrando
                    ? "border-accent bg-accent-soft"
                    : "border-separator bg-surface hover:border-accent/60 hover:bg-surface-secondary"
                }`}
              >
                <span className="grid size-12 place-items-center rounded-full bg-surface-secondary text-2xl text-muted transition-colors group-hover:text-accent">
                  <IconoSubir />
                </span>
                <span className="font-medium">
                  {arrastrando
                    ? "Soltá el archivo acá"
                    : "Arrastrá el archivo o hacé clic para elegirlo"}
                </span>
                <span className="text-sm text-muted">PDF con texto o DOCX · hasta 20 páginas</span>
              </button>
            )}
            {errorArchivo && (
              <p role="alert" className="text-sm text-danger">
                {errorArchivo}
              </p>
            )}
          </section>

          <section aria-labelledby="paso-categorias" className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-4">
              <Paso
                numero={2}
                id="paso-categorias"
                titulo="Qué datos ocultar"
                detalle={`${cantidadActivas} de ${CATEGORIAS.length} categorías activas`}
              />
              <button
                type="button"
                className="text-sm font-medium text-accent hover:underline"
                onClick={() =>
                  setActivas(todasActivas ? new Set() : new Set(opcionales.map((c) => c.id)))
                }
              >
                {todasActivas ? "Quitar todas" : "Activar todas"}
              </button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {CATEGORIAS.map((categoria) => {
                const bloqueada = esBloqueada(categoria);
                const activa = bloqueada || activas.has(categoria.id);
                return (
                  <li key={categoria.id}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activa}
                      disabled={bloqueada}
                      onClick={() => alternar(categoria.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                        activa
                          ? "border-foreground/15 bg-surface shadow-sm"
                          : "border-separator bg-transparent text-muted hover:bg-surface"
                      } ${bloqueada ? "cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${activa ? paleta(categoria.id).punto : "bg-separator"}`}
                      />
                      <span className="flex-1">
                        {categoria.nombre}
                        {bloqueada && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                            <IconoCandado className="size-3" /> Siempre se anonimizan
                          </span>
                        )}
                      </span>
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                          activa
                            ? "border-foreground bg-foreground text-background"
                            : "border-separator"
                        }`}
                      >
                        {activa && <IconoCheck className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="flex flex-col items-stretch gap-3 border-t border-separator pt-6 sm:flex-row sm:items-center sm:justify-between">
            {subir.isError ? (
              <p role="alert" className="text-sm text-danger">
                {subir.error.message}
              </p>
            ) : (
              <p className="text-sm text-muted">
                {archivo ? "Todo listo para procesar." : "Elegí un documento para continuar."}
              </p>
            )}
            <Button
              size="lg"
              isDisabled={!archivo || subir.isPending}
              onPress={() => subir.mutate()}
            >
              {subir.isPending ? "Subiendo…" : "Procesar documento"}
              {!subir.isPending && <IconoFlechaDerecha />}
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:pt-24">
          <div className="rounded-2xl border border-separator bg-surface p-5">
            <h2 className="text-sm font-semibold">Cómo funciona</h2>
            <ol className="mt-4 flex flex-col gap-4">
              {[
                ["Detección automática", "Buscamos los datos de las categorías elegidas."],
                ["Revisión obligatoria", "Confirmás, corregís o descartás cada detección."],
                ["Exportación", "Descargás el documento en su formato original."],
              ].map(([titulo, detalle], i) => (
                <li key={titulo} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-secondary text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{titulo}</p>
                    <p className="text-sm text-muted">{detalle}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex gap-3 rounded-2xl bg-surface-secondary p-5 text-sm">
            <IconoCandado className="mt-0.5 size-4 shrink-0" />
            <p className="text-muted">
              <span className="font-medium text-foreground">Privacidad.</span> El original se borra
              al exportar o, como máximo, a las 24 horas.
            </p>
          </div>
        </aside>
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

function Marcador({ children }: { children: string }) {
  return (
    <code className="rounded-md bg-surface-secondary px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

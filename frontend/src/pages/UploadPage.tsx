import { Button, Card } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { crearTrabajo } from "@/lib/jobs";
import { CATEGORIAS } from "@/lib/types";

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [activas, setActivas] = useState(
    () => new Set<string>(CATEGORIAS.filter((c) => c.porDefecto).map((c) => c.id)),
  );

  const subir = useMutation({
    mutationFn: () => crearTrabajo(archivo as File, [...activas]),
    onSuccess: ({ id }) => navigate(`/trabajos/${id}`),
  });

  function alternar(id: string) {
    setActivas((previas) => {
      const siguientes = new Set(previas);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Anon</h1>
        <p className="text-sm text-muted">
          Anonimizador de documentos judiciales. Cada detección se revisa antes de exportar.
        </p>
      </header>

      <Card>
        <Card.Header>
          <Card.Title>1. Documento</Card.Title>
          <Card.Description>PDF con texto o DOCX. Hasta 20 páginas.</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-separator p-8 text-center text-sm hover:bg-surface-secondary"
          >
            {archivo ? (
              <span className="font-medium">{archivo.name}</span>
            ) : (
              "Hacé clic para elegir un archivo"
            )}
          </button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>2. Categorías a anonimizar</Card.Title>
          <Card.Description>
            Elegí qué tipos de datos se ocultan en este documento. Los menores siempre se
            anonimizan.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <ul className="grid gap-2 sm:grid-cols-2">
            {CATEGORIAS.map((categoria) => {
              const bloqueada = "bloqueada" in categoria && categoria.bloqueada;
              return (
                <li key={categoria.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bloqueada || activas.has(categoria.id)}
                      disabled={bloqueada}
                      onChange={() => alternar(categoria.id)}
                    />
                    {categoria.nombre}
                    {bloqueada && <span className="text-xs text-muted">(siempre activa)</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </Card.Content>
      </Card>

      {subir.isError && (
        <p role="alert" className="text-sm text-danger">
          {subir.error.message}
        </p>
      )}

      <Button
        isDisabled={!archivo || subir.isPending}
        onPress={() => subir.mutate()}
        className="self-end"
      >
        {subir.isPending ? "Subiendo…" : "Procesar documento"}
      </Button>
    </main>
  );
}

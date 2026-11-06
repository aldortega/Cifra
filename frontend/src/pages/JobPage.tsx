import { Button, Card } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { ReviewView } from "@/components/ReviewView";
import { obtenerTrabajo } from "@/lib/jobs";

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

  if (trabajo.isPending) return <Aviso titulo="Cargando…" />;
  if (trabajo.isError) {
    return (
      <Aviso titulo="No se pudo consultar el trabajo" detalle={trabajo.error.message} volver />
    );
  }

  const t = trabajo.data;
  switch (t.estado) {
    case "subido":
    case "procesando":
      return (
        <Aviso
          titulo="Procesando el documento…"
          detalle={`${t.nombreArchivo}. Esto puede tardar unos segundos.`}
          cargando
        />
      );
    case "en_revision":
      return <ReviewView trabajo={t} />;
    case "fallido":
      return <Aviso titulo="El procesamiento falló" detalle={t.error} volver />;
    case "exportado":
      return <Aviso titulo="Documento exportado" detalle="El original ya fue eliminado." volver />;
    case "vencido":
      return (
        <Aviso
          titulo="El trabajo venció o no existe"
          detalle="Los documentos se eliminan a las 24 horas."
          volver
        />
      );
  }
}

function Aviso(props: { titulo: string; detalle?: string; cargando?: boolean; volver?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>{props.titulo}</Card.Title>
          {props.detalle && <Card.Description>{props.detalle}</Card.Description>}
        </Card.Header>
        {props.cargando && (
          <Card.Content>
            <progress aria-label="Procesando" className="h-2 w-full" />
          </Card.Content>
        )}
        {props.volver && (
          <Card.Footer>
            <Link to="/">
              <Button>Subir otro documento</Button>
            </Link>
          </Card.Footer>
        )}
      </Card>
    </main>
  );
}

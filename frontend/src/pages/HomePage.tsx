import { Button, Card } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

type Health = { status: string };

export function HomePage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<Health>("/health"),
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>Anon</Card.Title>
          <Card.Description>Anonimizador de documentos judiciales</Card.Description>
        </Card.Header>
        <Card.Content>
          <p className="text-sm">
            Backend:{" "}
            {health.isPending
              ? "verificando…"
              : health.isError
                ? "sin conexión"
                : health.data.status}
          </p>
        </Card.Content>
        <Card.Footer>
          <Button onPress={() => health.refetch()}>Reintentar</Button>
        </Card.Footer>
      </Card>
    </main>
  );
}

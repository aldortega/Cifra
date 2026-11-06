const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Error de la API con el mensaje del servidor, apto para mostrar al usuario. */
async function failure(res: Response, path: string): Promise<Error> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return new Error(body.detail);
  } catch {
    // La respuesta no era JSON: se usa el mensaje genérico.
  }
  return new Error(`Error ${res.status} en ${path}`);
}

export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // Necesario para enviar la cookie de sesión al backend.
    credentials: "include",
  });
  if (!res.ok) throw await failure(res, path);
  return res;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiRequest(path, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  return res.json() as Promise<T>;
}

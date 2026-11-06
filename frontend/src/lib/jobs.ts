import { apiFetch, apiRequest } from "./api";
import type { Deteccion, Trabajo } from "./types";

export function crearTrabajo(archivo: File, categorias: string[]): Promise<{ id: string }> {
  const datos = new FormData();
  datos.append("archivo", archivo);
  for (const categoria of categorias) datos.append("categorias", categoria);
  return apiFetch<{ id: string }>("/jobs", { method: "POST", body: datos });
}

export function obtenerTrabajo(id: string): Promise<Trabajo> {
  return apiFetch<Trabajo>(`/jobs/${id}`);
}

export async function reintentarTrabajo(id: string): Promise<void> {
  await apiRequest(`/jobs/${id}/retry`, { method: "POST" });
}

/** Exporta con las decisiones de la revisión. Se descarga en el mismo formato del original. */
export async function exportarTrabajo(
  id: string,
  detecciones: Deteccion[],
): Promise<{ nombre: string; url: string }> {
  const res = await apiRequest(`/jobs/${id}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detecciones }),
  });
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  return { nombre: nombre ?? "anonimizado", url: URL.createObjectURL(await res.blob()) };
}

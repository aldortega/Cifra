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

/** Cancela el trabajo: el servidor borra el original y deja de procesarlo. */
export async function cancelarTrabajo(id: string): Promise<void> {
  await apiRequest(`/jobs/${id}`, { method: "DELETE" });
}

export type FormatoSalida = "pdf" | "docx";

/** Exporta con las decisiones de la revisión, en el formato pedido (por defecto, el original). */
export async function exportarTrabajo(
  id: string,
  detecciones: Deteccion[],
  salida?: FormatoSalida,
): Promise<{ nombre: string; url: string }> {
  const res = await apiRequest(`/jobs/${id}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detecciones, salida }),
  });
  return { nombre: nombreDescarga(res, salida), url: URL.createObjectURL(await res.blob()) };
}

/** Nombre del archivo según el servidor: prefiere la versión UTF-8 (`filename*`). */
function nombreDescarga(res: Response, salida?: FormatoSalida): string {
  const cabecera = res.headers.get("Content-Disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecera)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // Codificación inválida: se usa el nombre ASCII.
    }
  }
  return /filename="([^"]+)"/.exec(cabecera)?.[1] ?? `anonimizado.${salida ?? "docx"}`;
}

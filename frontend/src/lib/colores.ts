import type { EstadoDeteccion } from "./types";

type Paleta = {
  /** Punto de color para listas y leyendas. */
  punto: string;
  /** Resaltado de una detección pendiente (tenue, subrayado discontinuo). */
  pendiente: string;
  /** Resaltado de una detección confirmada. */
  confirmada: string;
  /** Etiqueta (chip) con el nombre de la categoría. */
  chip: string;
};

// Clases completas (no interpoladas) para que Tailwind las detecte.
const PALETAS: Record<string, Paleta | undefined> = {
  PERSONA: {
    punto: "bg-sky-500",
    pendiente: "bg-sky-500/10 decoration-sky-500",
    confirmada: "bg-sky-500/25 decoration-sky-600",
    chip: "bg-sky-500/15 text-sky-700",
  },
  DNI: {
    punto: "bg-violet-500",
    pendiente: "bg-violet-500/10 decoration-violet-500",
    confirmada: "bg-violet-500/25 decoration-violet-600",
    chip: "bg-violet-500/15 text-violet-700",
  },
  DOMICILIO: {
    punto: "bg-amber-500",
    pendiente: "bg-amber-500/10 decoration-amber-500",
    confirmada: "bg-amber-500/25 decoration-amber-600",
    chip: "bg-amber-500/15 text-amber-700",
  },
  TELEFONO: {
    punto: "bg-emerald-500",
    pendiente: "bg-emerald-500/10 decoration-emerald-500",
    confirmada: "bg-emerald-500/25 decoration-emerald-600",
    chip: "bg-emerald-500/15 text-emerald-700",
  },
  EMAIL: {
    punto: "bg-cyan-500",
    pendiente: "bg-cyan-500/10 decoration-cyan-500",
    confirmada: "bg-cyan-500/25 decoration-cyan-600",
    chip: "bg-cyan-500/15 text-cyan-700",
  },
  FECHA_NACIMIENTO: {
    punto: "bg-pink-500",
    pendiente: "bg-pink-500/10 decoration-pink-500",
    confirmada: "bg-pink-500/25 decoration-pink-600",
    chip: "bg-pink-500/15 text-pink-700",
  },
  MATRICULA: {
    punto: "bg-orange-500",
    pendiente: "bg-orange-500/10 decoration-orange-500",
    confirmada: "bg-orange-500/25 decoration-orange-600",
    chip: "bg-orange-500/15 text-orange-700",
  },
  MATRICULA_PROFESIONAL: {
    punto: "bg-indigo-500",
    pendiente: "bg-indigo-500/10 decoration-indigo-500",
    confirmada: "bg-indigo-500/25 decoration-indigo-600",
    chip: "bg-indigo-500/15 text-indigo-700",
  },
  POLIZA: {
    punto: "bg-teal-500",
    pendiente: "bg-teal-500/10 decoration-teal-500",
    confirmada: "bg-teal-500/25 decoration-teal-600",
    chip: "bg-teal-500/15 text-teal-700",
  },
  CBU: {
    punto: "bg-lime-500",
    pendiente: "bg-lime-500/10 decoration-lime-600",
    confirmada: "bg-lime-500/25 decoration-lime-700",
    chip: "bg-lime-500/15 text-lime-700",
  },
  SALUD: {
    punto: "bg-rose-500",
    pendiente: "bg-rose-500/10 decoration-rose-500",
    confirmada: "bg-rose-500/25 decoration-rose-600",
    chip: "bg-rose-500/15 text-rose-700",
  },
  EXPEDIENTE: {
    punto: "bg-slate-500",
    pendiente: "bg-slate-500/10 decoration-slate-500",
    confirmada: "bg-slate-500/25 decoration-slate-600",
    chip: "bg-slate-500/15 text-slate-700",
  },
  MENOR: {
    punto: "bg-red-600",
    pendiente: "bg-red-600/10 decoration-red-600",
    confirmada: "bg-red-600/25 decoration-red-700",
    chip: "bg-red-600/15 text-red-700",
  },
};

const PREDETERMINADA: Paleta = {
  punto: "bg-slate-500",
  pendiente: "bg-slate-500/10 decoration-slate-500",
  confirmada: "bg-slate-500/25 decoration-slate-600",
  chip: "bg-slate-500/15 text-slate-700",
};

export function paleta(categoria: string): Paleta {
  return PALETAS[categoria] ?? PREDETERMINADA;
}

/** Clases del resaltado de una detección en el texto, según su categoría y estado. */
export function claseResaltado(categoria: string, estado: EstadoDeteccion): string {
  const p = paleta(categoria);
  switch (estado) {
    case "pendiente":
      return `${p.pendiente} underline decoration-dashed decoration-2 underline-offset-4`;
    case "confirmada":
      return `${p.confirmada} underline decoration-2 underline-offset-4`;
    case "descartada":
      return "text-muted line-through decoration-1";
  }
}

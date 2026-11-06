export const CATEGORIAS = [
  { id: "PERSONA", nombre: "Personas", porDefecto: true },
  { id: "DNI", nombre: "DNI / CUIL / CUIT", porDefecto: true },
  { id: "DOMICILIO", nombre: "Domicilios", porDefecto: true },
  { id: "TELEFONO", nombre: "Teléfonos", porDefecto: true },
  { id: "EMAIL", nombre: "Emails", porDefecto: true },
  { id: "FECHA_NACIMIENTO", nombre: "Fechas de nacimiento", porDefecto: true },
  { id: "MATRICULA", nombre: "Matrículas", porDefecto: true },
  { id: "CBU", nombre: "CBU / cuentas", porDefecto: true },
  { id: "SALUD", nombre: "Datos de salud", porDefecto: true },
  { id: "EXPEDIENTE", nombre: "Número de expediente", porDefecto: false },
  { id: "MENOR", nombre: "Menores", porDefecto: true, bloqueada: true },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]["id"];

export function nombreCategoria(id: string): string {
  return CATEGORIAS.find((c) => c.id === id)?.nombre ?? id;
}

export type EstadoTrabajo =
  | "subido"
  | "procesando"
  | "en_revision"
  | "exportado"
  | "fallido"
  | "vencido";

export type EstadoDeteccion = "pendiente" | "confirmada" | "descartada";

export type Deteccion = {
  id: string;
  categoria: string;
  inicio: number;
  fin: number;
  estado: EstadoDeteccion;
};

export type Trabajo = {
  id: string;
  nombreArchivo: string;
  estado: EstadoTrabajo;
  error?: string;
  texto?: string;
  detecciones?: Deteccion[];
};

export type FormatoExportacion = "docx" | "pdf";

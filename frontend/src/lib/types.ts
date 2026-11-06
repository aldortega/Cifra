export const CATEGORIAS = [
  { id: "PERSONA", nombre: "Personas", porDefecto: true },
  { id: "DNI", nombre: "DNI / CUIL / CUIT", porDefecto: true },
  { id: "DOMICILIO", nombre: "Domicilios", porDefecto: true },
  { id: "TELEFONO", nombre: "Teléfonos", porDefecto: true },
  { id: "EMAIL", nombre: "Emails", porDefecto: true },
  { id: "FECHA", nombre: "Fechas", porDefecto: true },
  { id: "MATRICULA", nombre: "Patentes de vehículos", porDefecto: true },
  { id: "MATRICULA_PROFESIONAL", nombre: "Matrículas profesionales", porDefecto: true },
  { id: "POLIZA", nombre: "Pólizas de seguro", porDefecto: true },
  { id: "CBU", nombre: "CBU / cuentas", porDefecto: true },
  { id: "SALUD", nombre: "Datos de salud", porDefecto: true },
  { id: "EXPEDIENTE", nombre: "Número de expediente", porDefecto: true },
  { id: "CARATULA", nombre: "Carátula", porDefecto: true },
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

/** Avance real del análisis: fragmentos del documento ya analizados sobre el total. */
export type Progreso = { etapa: "analizando"; hechos: number; total: number };

export type Trabajo = {
  id: string;
  nombreArchivo: string;
  estado: EstadoTrabajo;
  progreso?: Progreso | null;
  error?: string;
  texto?: string;
  /** Estructura visual del documento, con posiciones sobre `texto`. */
  formato?: Formato | null;
  detecciones?: Deteccion[];
};

export type Alineacion = "izquierda" | "centro" | "derecha" | "justificado";

/** Estilo de un tramo de texto. `tamano` en puntos. */
export type Estilo = {
  inicio: number;
  fin: number;
  negrita: boolean;
  cursiva: boolean;
  subrayado: boolean;
  tamano: number;
  fuente: string;
  familia: "serif" | "sans" | "mono";
};

/** Línea de un PDF con su caja en puntos, desde la esquina superior izquierda de la página. */
export type LineaPdf = {
  inicio: number;
  fin: number;
  pagina: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  alineacion: Alineacion;
};

export type FormatoPdf = {
  tipo: "pdf";
  paginas: { ancho: number; alto: number }[];
  lineas: LineaPdf[];
  estilos: Estilo[];
};

/** Párrafo de un DOCX. Medidas en puntos; `interlineado` es un line-height de CSS. */
export type ParrafoDocx = {
  inicio: number;
  fin: number;
  seccion: "cuerpo" | "encabezado" | "pie" | "notas";
  alineacion: Alineacion;
  sangria: number;
  sangriaDerecha: number;
  primeraLinea: number;
  espacioAntes: number;
  interlineado: number;
  celda: { tabla: number; fila: number; columna: number } | null;
  /** Párrafo de una nota al pie o final; `primero` lleva el número de la nota. */
  nota?: { tipo: TipoNota; numero: number; primero: boolean } | null;
};

export type TipoNota = "nota" | "final";

/** Campo de Word que se completa al imprimir; mide cero si no guardaba un resultado. */
export type CampoDocx = { inicio: number; fin: number; tipo: "pagina" | "paginas" };

/** Llamada a una nota dentro del texto. */
export type ReferenciaDocx = { posicion: number; tipo: TipoNota; id: string; numero: number };

export type FormatoDocx = {
  tipo: "docx";
  pagina: {
    ancho: number;
    alto: number;
    margenIzquierdo: number;
    margenDerecho: number;
    margenSuperior: number;
    margenInferior: number;
  };
  parrafos: ParrafoDocx[];
  estilos: Estilo[];
  campos?: CampoDocx[];
  referencias?: ReferenciaDocx[];
};

export type Formato = FormatoPdf | FormatoDocx;

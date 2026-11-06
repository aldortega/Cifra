// API SIMULADA: vive solo en el navegador hasta que el backend exponga los endpoints reales.
import type { Deteccion, FormatoExportacion, Trabajo } from "./types";

const TEXTO = `SENTENCIA

Buenos Aires, 12 de marzo de 2024.

AUTOS Y VISTOS: estos autos caratulados "Ibarra, Carlos c/ Giménez, Marta s/ alimentos", Expte. 4521/2023.

RESULTA: Que el actor Carlos Ibarra, DNI 27.345.678, con domicilio real en Av. Corrientes 1234, piso 5, CABA, promueve demanda contra Marta Giménez, CUIT 27-12345678-4, solicitando que se fije cuota alimentaria en favor del menor Tomás Ibarra, de 9 años, quien padece asma.

Que la demandada, con domicilio en Mitre 450, Rosario, contestó la demanda. Puede ser contactada al 11 4567-8901 o a marta.gimenez@example.com. Carlos Ibarra acompañó el CBU 0170099220000067797370 para el depósito.

Por ello, RESUELVO: hacer lugar a la demanda.`;

const VALORES: [string, string][] = [
  ["PERSONA", "Carlos Ibarra"],
  ["PERSONA", "Marta Giménez"],
  ["PERSONA", "Ibarra, Carlos"],
  ["PERSONA", "Giménez, Marta"],
  ["DNI", "27.345.678"],
  ["DNI", "27-12345678-4"],
  ["DOMICILIO", "Av. Corrientes 1234, piso 5, CABA"],
  ["DOMICILIO", "Mitre 450, Rosario"],
  ["TELEFONO", "11 4567-8901"],
  ["EMAIL", "marta.gimenez@example.com"],
  ["CBU", "0170099220000067797370"],
  ["MENOR", "Tomás Ibarra"],
  ["SALUD", "asma"],
  ["EXPEDIENTE", "4521/2023"],
];

type Registro = { trabajo: Trabajo; creado: number; categorias: string[] };
const trabajos = new Map<string, Registro>();
const TIEMPO_PROCESO_MS = 3000;

function detectar(categorias: string[]): Deteccion[] {
  const activas = new Set([...categorias, "MENOR"]);
  const out: Deteccion[] = [];
  for (const [categoria, valor] of VALORES) {
    if (!activas.has(categoria)) continue;
    let desde = 0;
    for (;;) {
      const inicio = TEXTO.indexOf(valor, desde);
      if (inicio < 0) break;
      out.push({
        id: crypto.randomUUID(),
        categoria,
        inicio,
        fin: inicio + valor.length,
        estado: "pendiente",
      });
      desde = inicio + valor.length;
    }
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function crearTrabajo(archivo: File, categorias: string[]): Promise<{ id: string }> {
  await esperar(300);
  const nombre = archivo.name.toLowerCase();
  if (!nombre.endsWith(".pdf") && !nombre.endsWith(".docx")) {
    throw new Error("Solo se aceptan archivos PDF con texto o DOCX.");
  }
  const id = crypto.randomUUID();
  trabajos.set(id, {
    trabajo: { id, nombreArchivo: archivo.name, estado: "procesando" },
    creado: Date.now(),
    categorias,
  });
  return { id };
}

export async function obtenerTrabajo(id: string): Promise<Trabajo> {
  await esperar(100);
  const registro = trabajos.get(id);
  if (!registro) return { id, nombreArchivo: "", estado: "vencido" };
  const { trabajo } = registro;
  if (trabajo.estado === "procesando" && Date.now() - registro.creado > TIEMPO_PROCESO_MS) {
    trabajo.estado = "en_revision";
    trabajo.texto = TEXTO;
    trabajo.detecciones = detectar(registro.categorias);
  }
  return structuredClone(trabajo);
}

export async function exportarTrabajo(
  id: string,
  formato: FormatoExportacion,
  detecciones: Deteccion[],
): Promise<{ nombre: string; url: string }> {
  await esperar(500);
  const registro = trabajos.get(id);
  if (!registro) throw new Error("El trabajo venció o no existe.");
  if (detecciones.some((d) => d.estado === "pendiente")) {
    throw new Error("Quedan detecciones sin revisar.");
  }
  registro.trabajo.estado = "exportado";
  const blob = new Blob(["Archivo simulado: el backend aún no genera la exportación real."], {
    type: "text/plain",
  });
  return { nombre: `anonimizado.${formato}.txt`, url: URL.createObjectURL(blob) };
}

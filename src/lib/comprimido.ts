import { unzipSync } from 'fflate';

import { leerBytes } from './archivos';
import { nombreSeguro } from './importador';
import type { ArchivoLocal } from './types';

/*
 * ZIP con los comprobantes que nombra la columna «Adjunto» del CSV. Se lee en el
 * teléfono (fflate, JavaScript puro): primero solo la lista de nombres, sin
 * descomprimir; al importar se extraen únicamente los que se usan. Las mismas reglas
 * que tenía la API (ExtractorComprimido). Los RAR no se pueden leer aquí.
 */

const EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'];
const MAX_COMPRIMIDO = 100 * 1024 * 1024;
const MAX_ARCHIVO = 10 * 1024 * 1024; // igual que un adjunto normal
const MAX_TOTAL = 500 * 1024 * 1024; // descomprimido: protege de "zip bombs"
const MAX_ENTRADAS = 5000;

export class ErrorDeComprimido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeDatos'; // mensajeDeError lo muestra tal cual
  }
}

export interface Comprimido {
  nombre: string;
  /** Cuántas imágenes y PDF trae. */
  archivos: number;
  omitidos: string[];
  /** Nombre seguro en minúscula → nombre de la entrada dentro del ZIP. */
  entradas: Map<string, string>;
  datos: Uint8Array;
}

function motivoParaOmitir(nombre: string, tamano: number, guardados: Map<string, string>) {
  if (nombre === '' || nombre.startsWith('.')) return 'oculto';
  if (!EXTENSIONES.includes(nombre.split('.').pop()?.toLowerCase() ?? '')) return 'no es imagen ni PDF';
  if (tamano > MAX_ARCHIVO) return 'más de 10 MB';
  if (guardados.has(nombre.toLowerCase())) return 'nombre repetido';
  return null;
}

export async function leerComprimido(archivo: ArchivoLocal): Promise<Comprimido> {
  const extension = archivo.nombre.split('.').pop()?.toLowerCase();
  if (extension === 'rar') {
    throw new ErrorDeComprimido('Los RAR no se pueden leer en el teléfono: comprime los comprobantes en un ZIP.');
  }
  if (extension !== 'zip') throw new ErrorDeComprimido('Sube un archivo ZIP.');

  const datos = await leerBytes(archivo);
  if (datos.length > MAX_COMPRIMIDO) throw new ErrorDeComprimido('El comprimido no puede pesar más de 100 MB.');

  const entradas = new Map<string, string>();
  const omitidos: string[] = [];
  let total = 0;
  let cantidad = 0;
  try {
    // Solo se recorre el índice: el filtro devuelve false y no se descomprime nada.
    unzipSync(datos, {
      filter(info) {
        if (++cantidad > MAX_ENTRADAS) throw new ErrorDeComprimido(`El ZIP tiene más de ${MAX_ENTRADAS} archivos.`);
        if (info.name.endsWith('/') || info.name.startsWith('__MACOSX/')) return false; // carpetas y basura de macOS

        const nombre = nombreSeguro(info.name);
        const motivo = motivoParaOmitir(nombre, info.originalSize, entradas);
        if (motivo) {
          if (motivo !== 'oculto') omitidos.push(`${nombre} (${motivo})`);
          return false;
        }
        total += info.originalSize;
        if (total > MAX_TOTAL) throw new ErrorDeComprimido('El contenido descomprimido supera 500 MB.');
        entradas.set(nombre.toLowerCase(), info.name);
        return false;
      },
    });
  } catch (e) {
    if (e instanceof ErrorDeComprimido) throw e;
    throw new ErrorDeComprimido('El ZIP está dañado o no se puede abrir.');
  }

  if (entradas.size === 0) throw new ErrorDeComprimido('El comprimido no tiene imágenes ni PDF.');
  return { nombre: archivo.nombre, archivos: entradas.size, omitidos: omitidos.slice(0, 50), entradas, datos };
}

/** Descomprime solo los archivos pedidos (por nombre seguro, sin importar mayúsculas). */
export function extraer(comprimido: Comprimido, nombres: string[]): Map<string, Uint8Array> {
  const buscados = new Set(nombres.map((n) => comprimido.entradas.get(n.toLowerCase())).filter((n) => n !== undefined));
  if (buscados.size === 0) return new Map();

  const extraidos = unzipSync(comprimido.datos, { filter: (info) => buscados.has(info.name) });
  const porNombre = new Map<string, Uint8Array>();
  for (const [entrada, bytes] of Object.entries(extraidos)) {
    // El tamaño declarado en el índice podía mentir.
    if (bytes.length <= MAX_ARCHIVO) porNombre.set(nombreSeguro(entrada).toLowerCase(), bytes);
  }
  return porNombre;
}

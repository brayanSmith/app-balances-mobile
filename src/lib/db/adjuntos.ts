import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { leerBytes } from '../archivos';
import { reducirImagen } from '../imagenes';
import type { Adjunto, ArchivoLocal } from '../types';

import { base, notificar, usuarioDeLaBase } from './index';
import { nuevoId } from './registros';

/*
 * Comprobantes de las cuentas que guardan solo en el teléfono. Aquí se lleva la
 * lista; el archivo va en una carpeta propia de la app o, en web (no hay sistema de
 * archivos), dentro de la misma base (columna datos). En la nube los comprobantes
 * viven en la API (adjuntosApi) y esta tabla queda vacía.
 */

const enWeb = Platform.OS === 'web';

interface FilaAdjunto {
  id: string;
  movimiento_id: string;
  remoto_id: number | null;
  nombre: string;
  mime: string;
  tamano: number;
  /** El archivo en el teléfono ('' en web). */
  uri: string;
  /** El archivo en web (null en el teléfono). */
  datos: Uint8Array | null;
}

const carpetaDe = (usuario: number) => new Directory(Paths.document, 'adjuntos', String(usuario));

function carpeta() {
  const directorio = carpetaDe(usuarioDeLaBase());
  directorio.create({ idempotent: true, intermediates: true });
  return directorio;
}

/** Junto con borrarBase(): los archivos de los comprobantes locales de ese usuario (en web van con la base). */
export function borrarAdjuntosLocales(usuario: number) {
  if (enWeb) return;
  try {
    const directorio = carpetaDe(usuario);
    if (directorio.exists) directorio.delete();
  } catch {
    // Si no se puede borrar, solo ocupa espacio en el teléfono.
  }
}

const destino = (id: string, nombre: string) => new File(carpeta(), `${id}-${nombre.replace(/[^\w.-]+/g, '_')}`);

/** En web, un enlace temporal al archivo guardado en la base (vale mientras la pestaña esté abierta). */
const enlace = (f: FilaAdjunto) =>
  enWeb && f.datos ? URL.createObjectURL(new Blob([f.datos as BlobPart], { type: f.mime })) : f.uri;

const aAdjunto = (f: FilaAdjunto): Adjunto => ({
  id: f.id,
  nombre: f.nombre,
  mime: f.mime,
  tamano: f.tamano,
  es_imagen: f.mime.startsWith('image/'),
  url: enlace(f),
});

/** Para la cola de subida (al pasar a la nube). En web, con el File del navegador. */
const aArchivoLocal = (f: FilaAdjunto): ArchivoLocal => ({
  uri: enlace(f),
  nombre: f.nombre,
  mime: f.mime,
  ...(enWeb && f.datos && { file: new globalThis.File([f.datos as BlobPart], f.nombre, { type: f.mime }) }),
});

/** adjuntos_count del movimiento: lo calcula la API en la nube y aquí en local (no se sincroniza). */
const recontar = (movimientoId: string) =>
  base().runAsync(
    'UPDATE movimientos SET adjuntos_count = (SELECT COUNT(*) FROM adjuntos WHERE movimiento_id = ?) WHERE id = ?',
    movimientoId,
    movimientoId,
  );

async function insertarFila(fila: FilaAdjunto) {
  await base().runAsync(
    `INSERT INTO adjuntos (id, movimiento_id, remoto_id, nombre, mime, tamano, uri, datos, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fila.id, fila.movimiento_id, fila.remoto_id, fila.nombre, fila.mime, fila.tamano, fila.uri, fila.datos, Date.now()],
  );
}

function borrarArchivo(f: FilaAdjunto) {
  if (enWeb) return; // va con la fila
  try {
    const archivo = new File(f.uri);
    if (archivo.exists) archivo.delete();
  } catch {
    // Si no se puede borrar, solo ocupa espacio en el teléfono.
  }
}

/** Copia el archivo elegido (o descargado) a donde se guardan los comprobantes. */
async function guardar(id: string, nombre: string, origen: { archivo: ArchivoLocal } | { url: string }) {
  if (enWeb) {
    const datos =
      'archivo' in origen ? await leerBytes(origen.archivo) : new Uint8Array(await (await fetch(origen.url)).arrayBuffer());
    return { uri: '', datos, tamano: datos.length };
  }
  let copia: File;
  if ('archivo' in origen) {
    copia = destino(id, nombre);
    await new File(origen.archivo.uri).copy(copia);
  } else {
    copia = await File.downloadFileAsync(origen.url, destino(id, nombre), { idempotent: true });
  }
  return { uri: copia.uri, datos: null, tamano: copia.size ?? 0 };
}

export const adjuntosDb = {
  async listar(movimientoId: string): Promise<Adjunto[]> {
    const filas = await base().getAllAsync<FilaAdjunto>(
      'SELECT * FROM adjuntos WHERE movimiento_id = ? ORDER BY created_at',
      movimientoId,
    );
    return filas.map(aAdjunto);
  },

  /** Achica las fotos y guarda una copia de cada archivo elegido. */
  async agregar(movimientoId: string, archivos: ArchivoLocal[]) {
    for (const elegido of archivos) {
      const archivo = await reducirImagen(elegido);
      const id = nuevoId();
      const guardado = await guardar(id, archivo.nombre, { archivo });
      await insertarFila({ id, movimiento_id: movimientoId, remoto_id: null, nombre: archivo.nombre, mime: archivo.mime, ...guardado });
    }
    if (archivos.length) {
      await recontar(movimientoId);
      notificar(['movimientos']);
    }
  },

  async eliminar(id: string) {
    const fila = await base().getFirstAsync<FilaAdjunto>('SELECT * FROM adjuntos WHERE id = ?', id);
    if (!fila) return;
    await base().runAsync('DELETE FROM adjuntos WHERE id = ?', id);
    borrarArchivo(fila);
    await recontar(fila.movimiento_id);
    notificar(['movimientos']);
  },

  /** Al borrar el movimiento. */
  async eliminarDe(movimientoId: string) {
    const filas = await base().getAllAsync<FilaAdjunto>('SELECT * FROM adjuntos WHERE movimiento_id = ?', movimientoId);
    await base().runAsync('DELETE FROM adjuntos WHERE movimiento_id = ?', movimientoId);
    filas.forEach(borrarArchivo);
  },

  /** Al pasar de la nube al teléfono: descarga los comprobantes que aún no estén aquí. */
  async bajar(movimientoId: string, remotos: Adjunto[]) {
    const ya = await base().getAllAsync<{ remoto_id: number }>(
      'SELECT remoto_id FROM adjuntos WHERE movimiento_id = ? AND remoto_id IS NOT NULL',
      movimientoId,
    );
    const descargados = new Set(ya.map((f) => f.remoto_id));
    for (const remoto of remotos) {
      if (descargados.has(Number(remoto.id))) continue;
      const id = nuevoId();
      const guardado = await guardar(id, remoto.nombre, { url: remoto.url });
      await insertarFila({
        id,
        movimiento_id: movimientoId,
        remoto_id: Number(remoto.id),
        nombre: remoto.nombre,
        mime: remoto.mime,
        ...guardado,
        tamano: remoto.tamano,
      });
    }
    await recontar(movimientoId);
  },

  /**
   * Al pasar del teléfono a la nube: entrega los comprobantes (para subirlos) y los
   * quita de esta tabla. Los archivos se conservan hasta que se suban. Con
   * `servidorIntacto` (nunca se llegó a liberar), los bajados de la API siguen allá:
   * solo se entregan los nuevos.
   */
  async entregarParaSubir(servidorIntacto: boolean): Promise<{ movimientoId: string; archivos: ArchivoLocal[] }[]> {
    const filas = await base().getAllAsync<FilaAdjunto>('SELECT * FROM adjuntos ORDER BY created_at');
    const porMovimiento = new Map<string, ArchivoLocal[]>();
    for (const f of filas) {
      if (servidorIntacto && f.remoto_id !== null) {
        borrarArchivo(f);
        continue;
      }
      porMovimiento.set(f.movimiento_id, [...(porMovimiento.get(f.movimiento_id) ?? []), aArchivoLocal(f)]);
    }
    await base().runAsync('DELETE FROM adjuntos');
    // Hasta que se suban, la API no los cuenta: el pull trae el número real después.
    await base().runAsync('UPDATE movimientos SET adjuntos_count = 0');
    return [...porMovimiento].map(([movimientoId, archivos]) => ({ movimientoId, archivos }));
  },
};

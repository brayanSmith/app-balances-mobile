import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { ArchivoLocal } from './types';

/** Bytes de un archivo elegido en el teléfono (o el File del navegador en web). */
export async function leerBytes(archivo: ArchivoLocal): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const origen = archivo.file ?? (await (await fetch(archivo.uri)).blob());
    return new Uint8Array(await origen.arrayBuffer());
  }
  return new File(archivo.uri).bytes();
}

const MIMES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

export const mimeDe = (nombre: string) => MIMES[nombre.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/**
 * Guarda bytes como un archivo temporal (p. ej. lo extraído de un ZIP) para usarlo
 * como cualquier archivo elegido. Quien lo recibe hace su propia copia.
 */
export async function guardarTemporal(nombre: string, bytes: Uint8Array): Promise<ArchivoLocal> {
  const mime = mimeDe(nombre);
  if (Platform.OS === 'web') {
    const file = new globalThis.File([bytes as BlobPart], nombre, { type: mime });
    return { uri: URL.createObjectURL(file), nombre, mime, file };
  }
  const carpeta = new Directory(Paths.cache, 'importacion');
  carpeta.create({ idempotent: true, intermediates: true });
  const destino = new File(carpeta, `${Crypto.randomUUID()}-${nombre.replace(/[^\w.-]+/g, '_')}`);
  await destino.write(bytes);
  return { uri: destino.uri, nombre, mime };
}

/** Borra los temporales de guardarTemporal (en web no hay nada que borrar). */
export function borrarTemporales() {
  if (Platform.OS === 'web') return;
  try {
    const carpeta = new Directory(Paths.cache, 'importacion');
    if (carpeta.exists) carpeta.delete();
  } catch {
    // Es la caché: el sistema la limpia solo.
  }
}

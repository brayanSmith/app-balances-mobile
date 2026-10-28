import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ArchivoLocal } from './types';

/** Lado más largo con el que se sube una foto: se lee bien una factura y pesa ~300 KB. */
const LADO_MAXIMO = 1600;

/**
 * Achica una foto antes de subirla (una de cámara pesa 3–5 MB) y la guarda como JPEG.
 * Las que ya son pequeñas no se agrandan. Los PDF y lo que no se pueda procesar
 * se suben tal cual.
 */
export async function reducirImagen(archivo: ArchivoLocal): Promise<ArchivoLocal> {
  if (!archivo.mime.startsWith('image/')) return archivo;
  try {
    // Se reduce al decodificarla: la foto completa nunca se carga en memoria.
    const contexto = ImageManipulator.manipulate(archivo.uri, { maxWidth: LADO_MAXIMO, maxHeight: LADO_MAXIMO });
    const imagen = await contexto.renderAsync();
    const resultado = await imagen.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    contexto.release();
    imagen.release();
    return { uri: resultado.uri, nombre: archivo.nombre.replace(/\.[^.]*$/, '') + '.jpg', mime: 'image/jpeg' };
  } catch {
    return archivo;
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { reducirImagen } from './imagenes';
import type { ArchivoLocal, Categoria, MovimientoInput, PagoInput, TipoMovimiento } from './types';

/*
 * Cola de movimientos y pagos nuevos. Todo lo nuevo se guarda primero aquí (la
 * hoja se cierra al instante) y se envía en segundo plano, en orden: enseguida
 * si hay internet o cuando vuelva (ver context/sincronizacion.tsx).
 */

export type Operacion =
  | { tipo: 'movimiento'; datos: MovimientoInput }
  | { tipo: 'pago'; programacionId: number; datos: PagoInput };

export interface EnCola {
  /** También es el cliente_id que evita duplicados en la API. */
  id: string;
  operacion: Operacion;
  /** Comprobantes que faltan por subir (copias guardadas en el dispositivo). */
  archivos: ArchivoLocal[];
  /** Ya se creó en la API y solo faltan comprobantes. */
  movimientoId: number | null;
  creado: number;
  /** La API lo rechazó: necesita que el usuario lo revise o descarte. */
  error: string | null;
  /** Para mostrarlo en la lista mientras tanto. */
  vista: {
    tipo: TipoMovimiento;
    monto: number;
    descripcion: string;
    fecha: string;
    categoria: Categoria | null;
  };
}

const CLAVE = 'cola_sin_conexion';

export async function leerCola(): Promise<EnCola[]> {
  const guardada = await AsyncStorage.getItem(CLAVE).catch(() => null);
  return guardada ? (JSON.parse(guardada) as EnCola[]) : [];
}

export async function guardarCola(cola: EnCola[]) {
  await AsyncStorage.setItem(CLAVE, JSON.stringify(cola));
}

/**
 * Achica las fotos y, en el celular, copia los comprobantes a una carpeta propia:
 * la caché del selector de archivos puede borrarse antes de que se envíen.
 * En web se conservan las referencias del navegador (se pierden si se recarga la página).
 */
export async function guardarArchivos(id: string, archivos: ArchivoLocal[]): Promise<ArchivoLocal[]> {
  if (archivos.length === 0) return archivos;
  const reducidos = await Promise.all(archivos.map(reducirImagen));
  if (Platform.OS === 'web') return reducidos;

  const carpeta = new Directory(Paths.document, 'pendientes');
  carpeta.create({ idempotent: true, intermediates: true });

  return Promise.all(
    reducidos.map(async (archivo, i) => {
      const copia = new File(carpeta, `${id}-${i}-${archivo.nombre.replace(/[^\w.-]+/g, '_')}`);
      await new File(archivo.uri).copy(copia);
      return { ...archivo, uri: copia.uri };
    }),
  );
}

/** Borra la copia local de un comprobante que ya se subió (o se descartó). */
export function borrarArchivo(archivo: ArchivoLocal) {
  if (Platform.OS === 'web') return;
  try {
    const copia = new File(archivo.uri);
    if (copia.exists) copia.delete();
  } catch {
    // Si no se puede borrar, solo ocupa espacio en la caché de la app.
  }
}

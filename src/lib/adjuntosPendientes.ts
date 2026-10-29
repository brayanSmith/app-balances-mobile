import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ArchivoLocal } from './types';

/*
 * Comprobantes elegidos en el teléfono que aún no se suben. Se suben cuando el
 * movimiento ya llegó a la API (después de sincronizar). Las copias de los
 * archivos las hace guardarArchivos() de cola.ts.
 */

export interface AdjuntosPendientes {
  /** uuid del movimiento. */
  movimientoId: string;
  archivos: ArchivoLocal[];
}

const clave = (usuario: number) => `adjuntos_pendientes:${usuario}`;

export async function leerAdjuntosPendientes(usuario: number): Promise<AdjuntosPendientes[]> {
  const guardado = await AsyncStorage.getItem(clave(usuario)).catch(() => null);
  return guardado ? (JSON.parse(guardado) as AdjuntosPendientes[]) : [];
}

export async function guardarAdjuntosPendientes(usuario: number, lista: AdjuntosPendientes[]) {
  await AsyncStorage.setItem(clave(usuario), JSON.stringify(lista));
}

export async function borrarAdjuntosPendientes(usuario: number) {
  await AsyncStorage.removeItem(clave(usuario)).catch(() => {});
}

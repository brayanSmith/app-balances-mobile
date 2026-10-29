import * as Crypto from 'expo-crypto';
import type { SQLiteBindValue } from 'expo-sqlite';

import { base, type Tabla } from './index';

/*
 * Escrituras de bajo nivel. Toda escritura de los repositorios pasa por aquí para
 * que quede marcada como pendiente de enviar (_estado) y con su updated_at.
 */

export type Valores = Record<string, SQLiteBindValue>;

/** Id de un registro nuevo: es el mismo uuid que guarda la API. */
export const nuevoId = () => Crypto.randomUUID();

/** Error de datos que se muestra tal cual al usuario (ver mensajeDeError). */
export class ErrorDeDatos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeDatos';
  }
}

/** Fragmento SET para cualquier cambio local: lo nuevo sigue "creado"; lo demás pasa a "actualizado". */
export const MARCAR_CAMBIO = `updated_at = ?, _estado = CASE _estado WHEN 'creado' THEN 'creado' ELSE 'actualizado' END`;

export async function insertar(tabla: Tabla, valores: Valores & { id: string }) {
  const ahora = Date.now();
  const fila: Valores = { ...valores, created_at: ahora, updated_at: ahora, _estado: 'creado' };
  const columnas = Object.keys(fila);
  await base().runAsync(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
    Object.values(fila),
  );
}

export async function actualizar(tabla: Tabla, id: string, cambios: Valores) {
  const columnas = Object.keys(cambios);
  if (!columnas.length) return;
  await base().runAsync(
    `UPDATE ${tabla} SET ${columnas.map((c) => `${c} = ?`).join(', ')}, ${MARCAR_CAMBIO} WHERE id = ?`,
    [...Object.values(cambios), Date.now(), id],
  );
}

/** Borra y deja el rastro para enviarlo a la API (si nunca llegó allá, la API lo ignora). */
export async function eliminar(tabla: Tabla, id: string) {
  await base().runAsync(`DELETE FROM ${tabla} WHERE id = ?`, id);
  await base().runAsync('INSERT OR IGNORE INTO _eliminados (tabla, id) VALUES (?, ?)', tabla, id);
}

/** Corre `tarea` en una transacción: si algo falla, no queda nada a medias. */
export const enTransaccion = (tarea: () => Promise<void>) => base().withTransactionAsync(tarea);

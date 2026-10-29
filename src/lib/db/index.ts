import * as SQLite from 'expo-sqlite';

import { MIGRACIONES } from './migraciones';

/*
 * Base SQLite del dispositivo: la app lee y escribe siempre aquí. Si la cuenta
 * guarda en la nube, sync.ts la mantiene al día con la API (/api/sync).
 * Cada usuario tiene su propio archivo, así que cambiar de cuenta no mezcla datos.
 */

let actual: { usuario: number; db: SQLite.SQLiteDatabase } | null = null;

const nombreArchivo = (usuario: number) => `balances-${usuario}.db`;

/** Abre (y migra si hace falta) la base del usuario. Lo llama la sesión al entrar. */
export async function abrirBase(usuario: number): Promise<SQLite.SQLiteDatabase> {
  if (actual?.usuario === usuario) return actual.db;
  await cerrarBase();

  const db = await SQLite.openDatabaseAsync(nombreArchivo(usuario));
  await migrar(db);
  actual = { usuario, db };
  return db;
}

export async function cerrarBase() {
  const anterior = actual;
  actual = null;
  await anterior?.db.closeAsync();
}

/** Al cerrar sesión o eliminar la cuenta: los datos de ese usuario salen del dispositivo. */
export async function borrarBase(usuario: number) {
  if (actual?.usuario === usuario) await cerrarBase();
  await SQLite.deleteDatabaseAsync(nombreArchivo(usuario)).catch(() => {});
}

/** De quién es la base abierta (los comprobantes locales se guardan en una carpeta por usuario). */
export function usuarioDeLaBase(): number {
  if (!actual) throw new Error('La base local no está abierta: abre la sesión primero.');
  return actual.usuario;
}

/** La base abierta. Falla si todavía no hay sesión (no debería pasar: las pantallas van después del login). */
export function base(): SQLite.SQLiteDatabase {
  if (!actual) throw new Error('La base local no está abierta: abre la sesión primero.');
  return actual.db;
}

/** Ejecuta las migraciones que falten; PRAGMA user_version guarda cuántas ya corrieron. */
async function migrar(db: SQLite.SQLiteDatabase) {
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = fila?.user_version ?? 0;

  for (let i = version; i < MIGRACIONES.length; i++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRACIONES[i]);
      await db.execAsync(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

export type Tabla = 'categorias' | 'programaciones' | 'movimientos';

const oyentes = new Set<(tablas: Tabla[]) => void>();

/** Avisa a las pantallas que algo cambió (lo llaman los repositorios y la sincronización). */
export function notificar(tablas: Tabla[]) {
  if (tablas.length) oyentes.forEach((oyente) => oyente(tablas));
}

export function alCambiar(oyente: (tablas: Tabla[]) => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

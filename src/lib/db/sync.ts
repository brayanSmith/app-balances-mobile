import { isAxiosError } from 'axios';
import type { SQLiteBindValue } from 'expo-sqlite';

import { api } from '../api';

import { base, notificar, type Tabla } from './index';

/*
 * Sincronización con la API (GET/POST /api/sync, protocolo de WatermelonDB):
 *
 * 1. pull: baja lo que cambió en el servidor desde el último pull y lo aplica.
 *    Lo que el dispositivo tiene pendiente de enviar no se pisa (gana lo local).
 * 2. push: sube lo creado, editado y borrado aquí con el timestamp de ese pull.
 *    Si otro dispositivo cambió algo mientras tanto (409), se repite desde el pull.
 *
 * Solo para cuentas que guardan en la nube; las locales nunca llaman a esto.
 */

const COLUMNAS: Record<Tabla, string[]> = {
  categorias: ['tipo', 'nombre', 'icono', 'color'],
  programaciones: [
    'movimiento_base_id',
    'intervalo',
    'frecuencia',
    'fecha_inicio',
    'fecha_fin',
    'ocurrencias',
    'proxima_fecha',
    'activo',
  ],
  movimientos: ['categoria_id', 'programacion_id', 'tipo', 'monto', 'descripcion', 'fecha', 'fecha_programada'],
};

// Calculadas en la API: se guardan al bajar, pero nunca se envían.
const SOLO_DEL_SERVIDOR: Partial<Record<Tabla, string[]>> = {
  movimientos: ['adjuntos_count'],
};

const TABLAS = Object.keys(COLUMNAS) as Tabla[];

type Registro = Record<string, SQLiteBindValue | boolean> & { id: string };

interface CambiosTabla {
  created: Registro[];
  updated: Registro[];
  deleted: string[];
}

type Cambios = Record<Tabla, CambiosTabla>;

const INTENTOS = 3;
let enCurso: Promise<boolean> | null = null;

/**
 * Sincroniza ya; si hay una sincronización en curso, espera esa.
 * Devuelve si algo cambió (bajó o subió algún registro).
 */
export function sincronizarBase(): Promise<boolean> {
  enCurso ??= sincronizar().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function sincronizar() {
  let cambio = false;
  for (let intento = 1; ; intento++) {
    const { timestamp, bajo } = await pull();
    cambio ||= bajo;
    try {
      return (await push(timestamp)) || cambio;
    } catch (error) {
      const conflicto = isAxiosError(error) && error.response?.status === 409;
      if (!conflicto || intento === INTENTOS) throw error;
    }
  }
}

async function leerValor(clave: string) {
  const fila = await base().getFirstAsync<{ valor: string | null }>('SELECT valor FROM _sync WHERE clave = ?', clave);
  return fila?.valor ?? null;
}

const guardarValor = (clave: string, valor: string) =>
  base().runAsync('INSERT OR REPLACE INTO _sync (clave, valor) VALUES (?, ?)', clave, valor);

/** Si la base nunca se sincronizó (primera vez en este dispositivo). */
export const yaSincronizada = async () => (await leerValor('ultimo_pull')) !== null;

/**
 * Estado de la base de este teléfono que no se sincroniza:
 * - modo: 'nube' | 'local', cómo se está usando ahora (null: nunca se abrió).
 * - pasando_a_local: '1' mientras falte bajar los comprobantes o liberar el servidor.
 */
export type ClaveEstado = 'modo' | 'pasando_a_local';

export const leerEstado = (clave: ClaveEstado) => leerValor(clave);

export async function guardarEstado(clave: ClaveEstado, valor: string | null) {
  if (valor === null) await base().runAsync('DELETE FROM _sync WHERE clave = ?', clave);
  else await guardarValor(clave, valor);
}

/** Solo baja (las cuentas locales no pueden subir): al pasar del servidor al teléfono. */
export async function bajarCambios(): Promise<boolean> {
  return (await pull()).bajo;
}

/**
 * Al pasar del teléfono a la nube: todo lo de aquí se envía como nuevo (el servidor
 * puede estar vacío) y la próxima sincronización baja desde cero.
 */
export async function marcarTodoParaSubir() {
  const db = base();
  await db.withTransactionAsync(async () => {
    for (const tabla of TABLAS) await db.runAsync(`UPDATE ${tabla} SET _estado = 'creado'`);
    await db.runAsync('DELETE FROM _eliminados');
    await db.runAsync("DELETE FROM _sync WHERE clave = 'ultimo_pull'");
  });
}

async function pull(): Promise<{ timestamp: number; bajo: boolean }> {
  const ultimo = await leerValor('ultimo_pull');
  const { data } = await api.get<{ changes: Cambios; timestamp: number }>('/sync', {
    params: ultimo ? { last_pulled_at: ultimo } : {},
    timeout: 60000,
  });

  const db = base();
  const tocadas: Tabla[] = [];
  await db.withTransactionAsync(async () => {
    for (const tabla of TABLAS) {
      const cambios = data.changes[tabla];
      if (!cambios) continue;
      const registros = [...cambios.created, ...cambios.updated];
      if (registros.length || cambios.deleted.length) tocadas.push(tabla);

      for (const registro of registros) await aplicar(tabla, registro);

      // Lo borrado en el servidor se borra aquí aunque tuviera cambios sin enviar.
      for (const id of cambios.deleted) {
        await db.runAsync(`DELETE FROM ${tabla} WHERE id = ?`, id);
        await db.runAsync('DELETE FROM _eliminados WHERE tabla = ? AND id = ?', tabla, id);
      }
    }
    await guardarValor('ultimo_pull', String(data.timestamp));
  });

  notificar(tocadas);
  return { timestamp: data.timestamp, bajo: tocadas.length > 0 };
}

/** Guarda un registro que llegó del servidor, salvo que aquí tenga cambios pendientes o esté por borrarse. */
async function aplicar(tabla: Tabla, registro: Registro) {
  const db = base();
  const local = await db.getFirstAsync<{ _estado: string }>(`SELECT _estado FROM ${tabla} WHERE id = ?`, registro.id);
  if (local && local._estado !== 'sincronizado') return;
  const eliminado = await db.getFirstAsync('SELECT 1 FROM _eliminados WHERE tabla = ? AND id = ?', tabla, registro.id);
  if (eliminado) return;

  const columnas = ['id', ...COLUMNAS[tabla], ...(SOLO_DEL_SERVIDOR[tabla] ?? []), 'created_at', 'updated_at', '_estado'];
  const valores = columnas.map((columna): SQLiteBindValue => {
    if (columna === '_estado') return 'sincronizado';
    const valor = registro[columna];
    if (typeof valor === 'boolean') return valor ? 1 : 0;
    return valor ?? (columna.endsWith('_at') ? Date.now() : columna.endsWith('_count') ? 0 : null);
  });
  // UPSERT y no REPLACE: así se conservan las columnas que solo existen aquí (p. ej. importacion_id).
  await db.runAsync(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${columnas
       .filter((c) => c !== 'id' && c !== 'created_at')
       .map((c) => `${c} = excluded.${c}`)
       .join(', ')}`,
    valores,
  );
}

/** Devuelve si había algo que enviar. */
async function push(ultimoPull: number): Promise<boolean> {
  const db = base();
  const cambios = {} as Cambios;
  // Para marcar como sincronizado solo lo que se envió tal cual (si se editó durante el envío, sigue pendiente).
  const enviados: { tabla: Tabla; id: string; updated_at: number }[] = [];
  let hayCambios = false;

  for (const tabla of TABLAS) {
    const pendientes = await db.getAllAsync<Record<string, SQLiteBindValue> & { id: string; _estado: string; updated_at: number }>(
      `SELECT * FROM ${tabla} WHERE _estado != 'sincronizado'`,
    );
    const borrados = await db.getAllAsync<{ id: string }>('SELECT id FROM _eliminados WHERE tabla = ?', tabla);

    const paraApi = (fila: (typeof pendientes)[number]): Registro => {
      const registro: Registro = { id: fila.id };
      for (const columna of COLUMNAS[tabla]) {
        registro[columna] = columna === 'activo' ? fila[columna] === 1 : fila[columna];
      }
      return registro;
    };

    cambios[tabla] = {
      created: pendientes.filter((f) => f._estado === 'creado').map(paraApi),
      updated: pendientes.filter((f) => f._estado === 'actualizado').map(paraApi),
      deleted: borrados.map((f) => f.id),
    };
    enviados.push(...pendientes.map((f) => ({ tabla, id: f.id, updated_at: f.updated_at })));
    hayCambios ||= pendientes.length > 0 || borrados.length > 0;
  }

  if (!hayCambios) return false;

  await api.post('/sync', { changes: cambios, last_pulled_at: ultimoPull }, { timeout: 60000 });

  await db.withTransactionAsync(async () => {
    for (const { tabla, id, updated_at } of enviados) {
      await db.runAsync(
        `UPDATE ${tabla} SET _estado = 'sincronizado' WHERE id = ? AND updated_at = ?`,
        id,
        updated_at,
      );
    }
    for (const tabla of TABLAS) {
      for (const id of cambios[tabla].deleted) {
        await db.runAsync('DELETE FROM _eliminados WHERE tabla = ? AND id = ?', tabla, id);
      }
    }
  });
  return true;
}

/** Cuántos cambios faltan por enviar (para mostrar "pendiente de sincronizar"). */
export async function pendientesDeEnviar(): Promise<number> {
  const db = base();
  let total = 0;
  for (const tabla of TABLAS) {
    const fila = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${tabla} WHERE _estado != 'sincronizado'`,
    );
    total += fila?.n ?? 0;
  }
  const borrados = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM _eliminados');
  return total + (borrados?.n ?? 0);
}

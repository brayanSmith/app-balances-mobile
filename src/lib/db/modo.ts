import type { AdjuntosPendientes } from '../adjuntosPendientes';
import { adjuntosApi, cuentaApi } from '../api';
import { borrarArchivo } from '../cola';

import { adjuntosDb } from './adjuntos';
import { categoriasDb } from './categorias';
import { base } from './index';
import { bajarCambios, guardarEstado, leerEstado, marcarTodoParaSubir } from './sync';

/*
 * Cambios de almacenamiento de la cuenta (los decide el administrador en /admin):
 *
 * - De la nube al teléfono: se baja lo último y los comprobantes, y se borra del
 *   servidor. La primera parte no necesita internet si el teléfono ya tenía los datos;
 *   la segunda se reintenta (pasando_a_local) hasta lograrlo.
 * - Del teléfono a la nube: todo queda pendiente de enviar y la sincronización lo sube.
 */

/**
 * Primera parte del paso al teléfono. `pendientes`: comprobantes que esperaban subirse
 * (se quedan en el teléfono; quien llama vacía su cola).
 */
export async function pasarALocal(nuncaSeUso: boolean, pendientes: AdjuntosPendientes[]) {
  // Teléfono nuevo: lo que hay en el servidor es todo lo que existe (sin internet, falla).
  if (nuncaSeUso) await bajarCambios();

  for (const pendiente of pendientes) {
    await adjuntosDb.agregar(pendiente.movimientoId, pendiente.archivos);
    pendiente.archivos.forEach(borrarArchivo);
  }

  await guardarEstado('pasando_a_local', '1');
  await guardarEstado('modo', 'local');
}

/** Segunda parte (necesita internet): baja lo último, descarga los comprobantes y libera el servidor. */
export async function completarPasoALocal() {
  await bajarCambios();

  // adjuntos_count todavía es el de la API: faltan los que tienen más que los ya descargados.
  const faltantes = await base().getAllAsync<{ id: string }>(
    `SELECT m.id FROM movimientos m
     WHERE m.adjuntos_count > (SELECT COUNT(*) FROM adjuntos a WHERE a.movimiento_id = m.id)`,
  );
  for (const { id } of faltantes) {
    await adjuntosDb.bajar(id, await adjuntosApi.listar(id));
  }

  await cuentaApi.liberarNube();
  await guardarEstado('pasando_a_local', null);

  // Una cuenta que nunca tuvo datos en el servidor arranca con las predeterminadas.
  if ((await categoriasDb.listar()).length === 0) await categoriasDb.crearPredeterminadas();
}

export const pasoALocalPendiente = async () => (await leerEstado('pasando_a_local')) !== null;

/** Del teléfono a la nube. Devuelve los comprobantes locales para la cola de subida. */
export async function pasarANube(): Promise<AdjuntosPendientes[]> {
  await marcarTodoParaSubir();
  // Si nunca se llegó a liberar el servidor, los comprobantes bajados siguen allá.
  const locales = await adjuntosDb.entregarParaSubir(await pasoALocalPendiente());
  await guardarEstado('pasando_a_local', null);
  await guardarEstado('modo', 'nube');
  return locales;
}

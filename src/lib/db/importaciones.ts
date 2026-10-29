import { borrarTemporales, guardarTemporal, leerBytes } from '../archivos';
import { extraer, type Comprimido } from '../comprimido';
import {
  CAMPOS,
  interpretar,
  leerCsv,
  MAX_FILAS,
  normalizar,
  sugerirFormatoFecha,
  sugerirMapeo,
  type Csv,
  type FilaInterpretada,
} from '../importador';
import type {
  AdjuntoFaltante,
  ArchivoLocal,
  FormatoFecha,
  Importacion,
  MapeoImportacion,
  Previsualizacion,
  ResultadoImportacion,
  TipoMovimiento,
} from '../types';

import { base, notificar } from './index';
import { movimientosDb } from './movimientos';
import {
  crearProgramacionDesde,
  guardarProgramacion,
  leerProgramacion,
  programarDesde,
  ultimoMovimientoDe,
} from './programaciones';
import { actualizar, ErrorDeDatos, enTransaccion, insertar, nuevoId } from './registros';

/*
 * Importar un CSV a la base local: lo que hacía la API (ImportacionController), ahora
 * en el teléfono para cualquier cuenta. En la nube, la sincronización lo sube después.
 */

const MAX_CSV = 5 * 1024 * 1024;

export interface OpcionesImportacion {
  /** Sin mapeo ni formato se usan los sugeridos. */
  mapeo?: MapeoImportacion;
  formato?: FormatoFecha;
  /** ZIP con los comprobantes que nombra la columna «Adjunto». */
  comprimido?: Comprimido | null;
}

/** Filas con error: no se importa nada salvo que se pida omitirlas. */
export class ErrorDeImportacion extends Error {
  readonly errores: { fila: number; error: string }[];
  readonly conError: number;
  readonly validas: number;

  constructor(errores: { fila: number; error: string }[], conError: number, validas: number) {
    super(`${conError} filas tienen errores. Corrígelas o impórtalas omitiendo esas filas.`);
    this.name = 'ErrorDeDatos';
    this.errores = errores;
    this.conError = conError;
    this.validas = validas;
  }
}

/** Comprobantes de cada movimiento importado, para guardarlos (local) o subirlos (nube). */
export interface AdjuntosImportados {
  movimientoId: string;
  archivos: ArchivoLocal[];
}

/** Lee el CSV y resuelve el mapeo (el enviado o el sugerido) y el formato de fecha. */
async function leer(archivo: ArchivoLocal, opciones: OpcionesImportacion, exigirMapeo: boolean) {
  const bytes = await leerBytes(archivo);
  if (bytes.length > MAX_CSV) throw new ErrorDeDatos('El archivo no puede pesar más de 5 MB.');

  const csv = leerCsv(bytes);
  if (csv.columnas.length < 2 || csv.filas.length === 0) {
    throw new ErrorDeDatos(
      'No se encontraron datos. El CSV debe tener una fila de encabezados y al menos una fila de datos.',
    );
  }

  const mapeo = opciones.mapeo
    ? (Object.fromEntries(
        CAMPOS.map((campo) => {
          const columna = opciones.mapeo?.[campo] ?? null;
          return [campo, columna !== null && csv.columnas.includes(columna) ? columna : null];
        }),
      ) as MapeoImportacion)
    : sugerirMapeo(csv.columnas);

  const columnaFecha = mapeo.fecha === null ? -1 : csv.columnas.indexOf(mapeo.fecha);
  const formato = opciones.formato ?? sugerirFormatoFecha(csv.filas, columnaFecha < 0 ? null : columnaFecha);

  if (exigirMapeo) {
    const faltan = [];
    if (!mapeo.fecha) faltan.push('la fecha');
    if (!mapeo.descripcion) faltan.push('la descripción');
    if (!mapeo.monto && !mapeo.ingreso && !mapeo.gasto) faltan.push('el monto (o las columnas de ingreso/gasto)');
    if (faltan.length) throw new ErrorDeDatos(`Indica qué columna tiene ${faltan.join(', ')}.`);
  }

  return { csv, mapeo, formato };
}

const recortar = (texto: string, largo: number) => ([...texto].length <= largo ? texto : `${[...texto].slice(0, largo).join('').trimEnd()}...`);

/** Hasta 3 valores de ejemplo por columna, para reconocerla aunque el encabezado no diga nada. */
function muestras(csv: Csv) {
  return Object.fromEntries(
    csv.columnas.map((columna, c) => {
      const valores = csv.filas.slice(0, 30).map((f) => f[c] ?? '').filter((v) => v !== '');
      return [columna, [...new Set(valores)].slice(0, 3).map((v) => recortar(v, 40))];
    }),
  );
}

/** Misma fecha, tipo, monto y descripción: importar dos veces el mismo archivo no duplica. */
const clave = (fecha: string, tipo: string, monto: number, descripcion: string) =>
  [fecha, tipo, monto.toFixed(2), normalizar(descripcion)].join('|');

/**
 * Las filas programadas con la misma descripción y tipo son una serie (p. ej. el arriendo
 * de agosto, septiembre y octubre): se crea UNA programación desde el pago más reciente y
 * las anteriores quedan enlazadas a ella. Si ya existe una para esa serie, se reutiliza.
 * Devuelve cuántas programaciones nuevas se crearon.
 */
async function programarSeries(series: Map<string, { id: string; orden: number; fila: FilaInterpretada }[]>) {
  if (series.size === 0) return 0;

  const filas = await base().getAllAsync<{ id: string; tipo: TipoMovimiento; descripcion: string }>(
    `SELECT p.id, m.tipo, m.descripcion FROM programaciones p JOIN movimientos m ON m.id = p.movimiento_base_id`,
  );
  const existentes = new Map(filas.map((f) => [`${f.tipo}|${normalizar(f.descripcion)}`, f.id]));
  let creadas = 0;

  for (const [claveSerie, miembros] of series) {
    miembros.sort((a, b) => a.fila.fecha.localeCompare(b.fila.fecha) || a.orden - b.orden);
    const ultimo = miembros[miembros.length - 1];
    const regla = { ...ultimo.fila.repetir!, fecha_fin: ultimo.fila.hasta };

    let programacionId = existentes.get(claveSerie) ?? null;
    const ultimaFecha = programacionId ? (await ultimoMovimientoDe(programacionId))?.fecha : undefined;
    const esMasReciente = programacionId !== null && (ultimaFecha === undefined || ultimo.fila.fecha > ultimaFecha);

    if (!programacionId) {
      programacionId = await crearProgramacionDesde({ id: ultimo.id, fecha: ultimo.fila.fecha }, regla);
      creadas++;
    }
    for (const { id } of miembros) await actualizar('movimientos', id, { programacion_id: programacionId });

    // El CSV trae un pago más nuevo que la programación existente: pasa a ser la base
    // y el calendario se recalcula desde él.
    const p = esMasReciente ? await leerProgramacion(programacionId) : null;
    if (p) {
      p.intervalo = regla.intervalo;
      p.frecuencia = regla.frecuencia;
      p.fecha_fin = regla.fecha_fin;
      p.movimiento_base_id = ultimo.id;
      programarDesde(p, (await ultimoMovimientoDe(p.id))?.fecha ?? ultimo.fila.fecha);
      await guardarProgramacion(p);
    }
  }
  return creadas;
}

interface FilaImportacion {
  id: string;
  archivo: string;
  filas: number;
  importados: number;
  duplicados: number;
  omitidos: number;
  created_at: number;
}

const aImportacion = (f: FilaImportacion): Importacion => ({
  id: f.id,
  archivo: f.archivo,
  filas: f.filas,
  importados: f.importados,
  duplicados: f.duplicados,
  omitidos: f.omitidos,
  creada: new Date(f.created_at).toISOString(),
});

export const importacionesDb = {
  /** Columnas, mapeo (sugerido si no se envía) y cómo quedarían las primeras filas. No guarda nada. */
  async previsualizar(archivo: ArchivoLocal, opciones: OpcionesImportacion = {}): Promise<Previsualizacion> {
    const { csv, mapeo, formato } = await leer(archivo, opciones, false);
    const disponibles = opciones.comprimido?.entradas;

    let validas = 0;
    let referenciados = 0;
    const faltantes: AdjuntoFaltante[] = [];
    const vistaPrevia: Previsualizacion['vista_previa'] = [];
    csv.filas.forEach((fila, i) => {
      const [datos, error] = interpretar(fila, csv.columnas, mapeo, formato);
      if (datos) validas++;

      const adjuntos = (datos?.adjuntos ?? []).map((nombre) => {
        const encontrado = disponibles?.has(nombre.toLowerCase()) ?? false;
        referenciados++;
        if (!encontrado) faltantes.push({ fila: i + 2, nombre });
        return { nombre, encontrado };
      });

      if (i < 5) vistaPrevia.push({ fila: i + 2, datos, error, adjuntos });
    });

    return {
      columnas: csv.columnas,
      muestras: muestras(csv),
      mapeo,
      formato_fecha: formato,
      total_filas: csv.filas.length,
      validas,
      con_error: csv.filas.length - validas,
      vista_previa: vistaPrevia,
      adjuntos: { referenciados, encontrados: referenciados - faltantes.length, faltantes: faltantes.slice(0, 50) },
    };
  },

  /**
   * Importa el CSV. Si hay filas con error no importa nada (salvo `omitirErrores`).
   * Las filas que ya existen se omiten. Los comprobantes extraídos del ZIP se devuelven
   * aparte (archivos temporales): quien llama los guarda o los sube.
   */
  async importar(
    archivo: ArchivoLocal,
    opciones: OpcionesImportacion,
    omitirErrores: boolean,
  ): Promise<{ resultado: ResultadoImportacion; adjuntos: AdjuntosImportados[] }> {
    const { csv, mapeo, formato } = await leer(archivo, opciones, true);
    if (csv.filas.length > MAX_FILAS) {
      throw new ErrorDeDatos(`El archivo tiene más de ${MAX_FILAS} filas. Divídelo en partes.`);
    }

    const validas: (FilaInterpretada & { fila: number })[] = [];
    const errores: { fila: number; error: string }[] = [];
    csv.filas.forEach((fila, i) => {
      const [datos, error] = interpretar(fila, csv.columnas, mapeo, formato);
      if (datos) validas.push({ ...datos, fila: i + 2 });
      else errores.push({ fila: i + 2, error: error ?? 'Fila inválida' });
    });

    if (errores.length && !omitirErrores) throw new ErrorDeImportacion(errores.slice(0, 50), errores.length, validas.length);
    if (validas.length === 0) throw new ErrorDeDatos('No hay filas válidas para importar.');

    // Solo se descomprime lo que el CSV nombra.
    const extraidos = opciones.comprimido ? extraer(opciones.comprimido, validas.flatMap((f) => f.adjuntos)) : new Map();

    const importacionId = nuevoId();
    const creadas: string[] = [];
    const adjuntos: AdjuntosImportados[] = [];
    const adjuntosFaltantes: AdjuntoFaltante[] = [];
    let importados = 0;
    let duplicados = 0;
    let adjuntosImportados = 0;
    let programacionesCreadas = 0;

    borrarTemporales(); // los de una importación anterior
    await enTransaccion(async () => {
      // Movimientos que ya existen en el rango del archivo, contados por clave.
      const fechas = validas.map((f) => f.fecha).sort();
      const enRango = await base().getAllAsync<{ fecha: string; tipo: string; monto: number; descripcion: string }>(
        'SELECT fecha, tipo, monto, descripcion FROM movimientos WHERE fecha >= ? AND fecha <= ?',
        fechas[0],
        fechas[fechas.length - 1],
      );
      const existentes = new Map<string, number>();
      for (const m of enRango) {
        const k = clave(m.fecha, m.tipo, m.monto, m.descripcion);
        existentes.set(k, (existentes.get(k) ?? 0) + 1);
      }

      const filasCategorias = await base().getAllAsync<{ id: string; tipo: string; nombre: string }>(
        'SELECT id, tipo, nombre FROM categorias',
      );
      const categorias = new Map(filasCategorias.map((c) => [`${c.tipo}|${normalizar(c.nombre)}`, c.id]));
      const series = new Map<string, { id: string; orden: number; fila: FilaInterpretada }[]>();

      for (const [orden, fila] of validas.entries()) {
        const k = clave(fila.fecha, fila.tipo, fila.monto, fila.descripcion);
        if ((existentes.get(k) ?? 0) > 0) {
          existentes.set(k, existentes.get(k)! - 1);
          duplicados++;
          continue;
        }

        let categoriaId: string | null = null;
        if (fila.categoria !== null) {
          const claveCategoria = `${fila.tipo}|${normalizar(fila.categoria)}`;
          if (!categorias.has(claveCategoria)) {
            const id = nuevoId();
            await insertar('categorias', { id, tipo: fila.tipo, nombre: fila.categoria, icono: 'pricetag', color: '#64748B' });
            categorias.set(claveCategoria, id);
            creadas.push(fila.categoria);
          }
          categoriaId = categorias.get(claveCategoria)!;
        }

        const id = nuevoId();
        await insertar('movimientos', {
          id,
          importacion_id: importacionId,
          tipo: fila.tipo,
          monto: fila.monto,
          descripcion: fila.descripcion,
          categoria_id: categoriaId,
          fecha: fila.fecha,
        });
        importados++;

        if (fila.repetir) {
          const claveSerie = `${fila.tipo}|${normalizar(fila.descripcion)}`;
          series.set(claveSerie, [...(series.get(claveSerie) ?? []), { id, orden, fila }]);
        }

        const archivos: ArchivoLocal[] = [];
        for (const nombre of fila.adjuntos) {
          const bytes = extraidos.get(nombre.toLowerCase());
          if (!bytes) {
            adjuntosFaltantes.push({ fila: fila.fila, nombre });
            continue;
          }
          archivos.push(await guardarTemporal(nombre, bytes));
          adjuntosImportados++;
        }
        if (archivos.length) adjuntos.push({ movimientoId: id, archivos });
      }

      programacionesCreadas = await programarSeries(series);

      await base().runAsync(
        `INSERT INTO importaciones (id, archivo, filas, importados, duplicados, omitidos, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [importacionId, archivo.nombre, csv.filas.length, importados, duplicados, errores.length, Date.now()],
      );
    });
    notificar(['categorias', 'movimientos', 'programaciones']);

    const importacion = await base().getFirstAsync<FilaImportacion>('SELECT * FROM importaciones WHERE id = ?', importacionId);
    return {
      resultado: {
        importacion: aImportacion(importacion!),
        importados,
        duplicados,
        omitidos: errores.length,
        categorias_creadas: creadas,
        adjuntos_importados: adjuntosImportados,
        adjuntos_faltantes: adjuntosFaltantes.slice(0, 50),
        programaciones_creadas: programacionesCreadas,
      },
      adjuntos,
    };
  },

  /** Últimas importaciones hechas en este teléfono, para poder deshacerlas. */
  async listar(): Promise<Importacion[]> {
    const filas = await base().getAllAsync<FilaImportacion>('SELECT * FROM importaciones ORDER BY created_at DESC LIMIT 20');
    return filas.map(aImportacion);
  },

  /** Deshace una importación: elimina los movimientos que creó (con sus reglas de programados). */
  async deshacer(id: string) {
    const movimientos = await base().getAllAsync<{ id: string }>('SELECT id FROM movimientos WHERE importacion_id = ?', id);
    for (const m of movimientos) await movimientosDb.eliminar(m.id);
    await base().runAsync('DELETE FROM importaciones WHERE id = ?', id);
    notificar(['movimientos']);
  },
};

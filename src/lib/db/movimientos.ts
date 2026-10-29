import type { SQLiteBindValue } from 'expo-sqlite';

import { desplazar, diasEntre, esFechaValida, hoy } from '../format';
import type { Evolucion, FiltrosMovimientos, Movimiento, MovimientoInput, Pagina, Resumen } from '../types';

import { adjuntosDb } from './adjuntos';
import { aCategoria, COLUMNAS_CATEGORIA, type FilaCategoria } from './categorias';
import { base, notificar } from './index';
import {
  crearProgramacionDesde,
  deshacerPago,
  eliminarProgramacion,
  guardarProgramacion,
  leerProgramacion,
  programarDesde,
  ultimoMovimientoDe,
  type FilaProgramacion,
} from './programaciones';
import { actualizar, ErrorDeDatos, eliminar, enTransaccion, insertar, nuevoId } from './registros';

/*
 * Movimientos: lo que antes hacía la API (MovimientoController y los eventos de
 * App\Models\Movimiento), ahora sobre la base local.
 */

const POR_PAGINA = 30;

interface FilaMovimiento extends Partial<Record<`c_${keyof FilaCategoria}`, string | null>> {
  id: string;
  tipo: Movimiento['tipo'];
  monto: number;
  descripcion: string;
  fecha: string;
  fecha_programada: string | null;
  categoria_id: string | null;
  programacion_id: string | null;
  adjuntos_count: number;
  p_id: string | null;
  p_movimiento_base_id: string | null;
  p_intervalo: number | null;
  p_frecuencia: FilaProgramacion['frecuencia'] | null;
  p_fecha_fin: string | null;
  p_proxima_fecha: string | null;
  p_activo: number | null;
}

const SELECT_MOVIMIENTOS = `
  SELECT m.*, ${COLUMNAS_CATEGORIA},
         p.id AS p_id, p.movimiento_base_id AS p_movimiento_base_id, p.intervalo AS p_intervalo,
         p.frecuencia AS p_frecuencia, p.fecha_fin AS p_fecha_fin, p.proxima_fecha AS p_proxima_fecha,
         p.activo AS p_activo
  FROM movimientos m
  LEFT JOIN categorias c ON c.id = m.categoria_id
  LEFT JOIN programaciones p ON p.id = m.programacion_id`;

const ORDEN = 'ORDER BY m.fecha DESC, m.created_at DESC';

function aMovimiento(f: FilaMovimiento): Movimiento {
  return {
    id: f.id,
    tipo: f.tipo,
    monto: f.monto,
    descripcion: f.descripcion,
    categoria: aCategoria(f),
    fecha: f.fecha,
    fecha_programada: f.fecha_programada,
    adjuntos_count: f.adjuntos_count, // los archivos viven en la API (ver adjuntosApi)
    programado: f.p_id !== null,
    programacion: f.p_id
      ? {
          id: f.p_id,
          intervalo: f.p_intervalo ?? 1,
          frecuencia: f.p_frecuencia ?? 'meses',
          fecha_fin: f.p_fecha_fin,
          proxima_fecha: f.p_proxima_fecha ?? f.fecha,
          activo: f.p_activo === 1,
          es_base: f.p_movimiento_base_id === f.id,
        }
      : null,
  };
}

/** WHERE de los filtros: mes, desde/hasta, tipo, categoría y búsqueda en la descripción. */
function filtrados(filtros: FiltrosMovimientos): { where: string; params: SQLiteBindValue[] } {
  const condiciones: string[] = [];
  const params: SQLiteBindValue[] = [];
  const agregar = (condicion: string, valor: SQLiteBindValue) => {
    condiciones.push(condicion);
    params.push(valor);
  };

  if (filtros.mes) agregar('substr(m.fecha, 1, 7) = ?', filtros.mes);
  if (filtros.desde) agregar('m.fecha >= ?', filtros.desde);
  if (filtros.hasta) agregar('m.fecha <= ?', filtros.hasta);
  if (filtros.tipo) agregar('m.tipo = ?', filtros.tipo);
  if (filtros.categoria_id) agregar('m.categoria_id = ?', filtros.categoria_id);
  if (filtros.q) agregar("m.descripcion LIKE ? ESCAPE '\\'", `%${filtros.q.replace(/[\\%_]/g, '\\$&')}%`);

  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', params };
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Balance acumulado día a día dentro del período (para el minigráfico). Arranca
 * en 0 el primer día y llega hasta hoy si el período sigue en curso.
 */
async function balanceDiario(filtros: FiltrosMovimientos): Promise<Resumen['balance_diario']> {
  let inicio: string;
  let fin: string;
  if (filtros.mes) {
    inicio = `${filtros.mes}-01`;
    fin = desplazar(desplazar(inicio, 1, 'meses'), -1, 'dias');
  } else if (filtros.desde && filtros.hasta) {
    inicio = filtros.desde;
    fin = filtros.hasta;
  } else {
    return [];
  }

  if (fin > hoy()) fin = hoy();
  if (inicio > fin || diasEntre(inicio, fin) > 400) return [];

  const { where, params } = filtrados(filtros);
  const filas = await base().getAllAsync<{ fecha: string; neto: number }>(
    `SELECT m.fecha, SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END) AS neto
     FROM movimientos m ${where} GROUP BY m.fecha`,
    params,
  );
  const netoPorDia = new Map(filas.map((f) => [f.fecha, f.neto]));

  const serie: Resumen['balance_diario'] = [];
  let acumulado = 0;
  for (let dia = inicio; dia <= fin; dia = desplazar(dia, 1, 'dias')) {
    acumulado += netoPorDia.get(dia) ?? 0;
    serie.push({ fecha: dia, balance: redondear(acumulado) });
  }
  return serie;
}

/**
 * Ingresos y gastos del período agrupados en el tiempo (gráfico del historial):
 * por día hasta un mes, por semana hasta tres meses, por mes hasta cinco años y
 * por año después. Los grupos sin movimientos van en 0 y no se pasa de hoy.
 */
async function evolucion(filtros: FiltrosMovimientos): Promise<Evolucion | null> {
  if (!filtros.hasta) return null;
  const { where, params } = filtrados(filtros);

  let inicio = filtros.desde;
  if (!inicio) {
    const primero = await base().getFirstAsync<{ fecha: string | null }>(
      `SELECT MIN(m.fecha) AS fecha FROM movimientos m ${where}`,
      params,
    );
    if (!primero?.fecha) return null; // "Todo" sin ningún movimiento
    inicio = primero.fecha;
  }
  const fin = filtros.hasta < hoy() ? filtros.hasta : hoy();
  if (inicio > fin) return null;

  const dias = diasEntre(inicio, fin) + 1;
  const agrupacion =
    filtros.agrupacion ?? (dias <= 31 ? 'dia' : dias <= 92 ? 'semana' : dias <= 366 * 5 ? 'mes' : 'anio');

  // Inicio del grupo de cada fecha. Las semanas se cuentan de 7 en 7 desde el
  // primer día del período; el primer mes o año puede ser parcial.
  const desde = inicio;
  const masTarde = (a: string, b: string) => (a > b ? a : b);
  const grupoDe = (fecha: string) => {
    switch (agrupacion) {
      case 'dia':
        return fecha;
      case 'semana':
        return desplazar(desde, Math.floor(diasEntre(desde, fecha) / 7) * 7, 'dias');
      case 'mes':
        return masTarde(`${fecha.slice(0, 7)}-01`, desde);
      case 'anio':
        return masTarde(`${fecha.slice(0, 4)}-01-01`, desde);
    }
  };

  const puntos = new Map<string, Evolucion['puntos'][number]>();
  let cursor = desde;
  while (cursor <= fin) {
    const grupo = grupoDe(cursor);
    puntos.set(grupo, { desde: grupo, ingresos: 0, gastos: 0 });
    cursor =
      agrupacion === 'dia'
        ? desplazar(cursor, 1, 'dias')
        : agrupacion === 'semana'
          ? desplazar(cursor, 7, 'dias')
          : agrupacion === 'mes'
            ? desplazar(`${cursor.slice(0, 7)}-01`, 1, 'meses')
            : desplazar(`${cursor.slice(0, 4)}-01-01`, 1, 'anios');
  }

  const porDia = await base().getAllAsync<{ fecha: string; ingresos: number; gastos: number }>(
    `SELECT m.fecha,
            SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE 0 END) AS ingresos,
            SUM(CASE WHEN m.tipo = 'gasto' THEN m.monto ELSE 0 END) AS gastos
     FROM movimientos m ${where ? `${where} AND` : 'WHERE'} m.fecha <= ?
     GROUP BY m.fecha`,
    [...params, fin],
  );
  for (const fila of porDia) {
    const punto = puntos.get(grupoDe(fila.fecha));
    if (!punto) continue;
    punto.ingresos = redondear(punto.ingresos + fila.ingresos);
    punto.gastos = redondear(punto.gastos + fila.gastos);
  }

  return { agrupacion, puntos: [...puntos.values()] };
}

/** Mismas reglas que MovimientoRequest en la API. */
async function validar(input: MovimientoInput) {
  if (!(input.monto > 0) || input.monto > 9999999999) throw new ErrorDeDatos('Escribe un monto mayor que cero.');
  if (!input.descripcion.trim()) throw new ErrorDeDatos('Escribe una descripción.');
  if (input.descripcion.length > 255) throw new ErrorDeDatos('La descripción es muy larga (máximo 255 caracteres).');
  if (!esFechaValida(input.fecha)) throw new ErrorDeDatos('La fecha no es válida.');
  if (input.programado) {
    if (!input.frecuencia) throw new ErrorDeDatos('Elige cada cuánto se repite.');
    const intervalo = input.intervalo ?? 1;
    if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 365) {
      throw new ErrorDeDatos('El intervalo debe estar entre 1 y 365.');
    }
  }
  if (input.fecha_fin && (!esFechaValida(input.fecha_fin) || input.fecha_fin <= input.fecha)) {
    throw new ErrorDeDatos('La fecha final debe ser posterior a la fecha del movimiento.');
  }
  // Una categoría que exista y sea del mismo tipo (gasto/ingreso).
  if (input.categoria_id) {
    const categoria = await base().getFirstAsync(
      'SELECT 1 FROM categorias WHERE id = ? AND tipo = ?',
      input.categoria_id,
      input.tipo,
    );
    if (!categoria) throw new ErrorDeDatos('La categoría elegida no es válida.');
  }
}

const datosMovimiento = (input: MovimientoInput) => ({
  tipo: input.tipo,
  monto: input.monto,
  descripcion: input.descripcion.trim(),
  categoria_id: input.categoria_id,
  fecha: input.fecha,
});

const regla = (input: MovimientoInput) => ({
  intervalo: input.intervalo,
  frecuencia: input.frecuencia,
  fecha_fin: input.fecha_fin,
});

async function leer(id: string): Promise<Movimiento> {
  const fila = await base().getFirstAsync<FilaMovimiento>(`${SELECT_MOVIMIENTOS} WHERE m.id = ?`, id);
  if (!fila) throw new ErrorDeDatos('Este movimiento ya no existe.');
  return aMovimiento(fila);
}

export const movimientosDb = {
  async listar(filtros: FiltrosMovimientos): Promise<Movimiento[]> {
    const { where, params } = filtrados(filtros);
    const filas = await base().getAllAsync<FilaMovimiento>(`${SELECT_MOVIMIENTOS} ${where} ${ORDEN}`, params);
    return filas.map(aMovimiento);
  },

  /** Listado paginado de a 30 (historial). */
  async pagina(filtros: FiltrosMovimientos, page: number): Promise<Pagina<Movimiento>> {
    const { where, params } = filtrados(filtros);
    const conteo = await base().getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM movimientos m ${where}`,
      params,
    );
    const total = conteo?.total ?? 0;
    const filas = await base().getAllAsync<FilaMovimiento>(
      `${SELECT_MOVIMIENTOS} ${where} ${ORDEN} LIMIT ? OFFSET ?`,
      [...params, POR_PAGINA, (page - 1) * POR_PAGINA],
    );
    return {
      data: filas.map(aMovimiento),
      meta: { current_page: page, last_page: Math.max(1, Math.ceil(total / POR_PAGINA)), total },
    };
  },

  /** Totales, gastos por categoría, balance diario y (con desde/hasta) la evolución. */
  async resumen(filtros: FiltrosMovimientos): Promise<Resumen> {
    const { where, params } = filtrados(filtros);
    const totales = await base().getFirstAsync<{ ingresos: number; gastos: number }>(
      `SELECT COALESCE(SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto END), 0) AS ingresos,
              COALESCE(SUM(CASE WHEN m.tipo = 'gasto' THEN m.monto END), 0) AS gastos
       FROM movimientos m ${where}`,
      params,
    );
    const ingresos = totales?.ingresos ?? 0;
    const gastos = totales?.gastos ?? 0;

    const porCategoria = await base().getAllAsync<{
      id: string | null;
      nombre: string | null;
      icono: string | null;
      color: string | null;
      total: number;
    }>(
      `SELECT c.id, c.nombre, c.icono, c.color, SUM(m.monto) AS total
       FROM movimientos m LEFT JOIN categorias c ON c.id = m.categoria_id
       ${where ? `${where} AND` : 'WHERE'} m.tipo = 'gasto'
       GROUP BY c.id ORDER BY total DESC`,
      params,
    );

    return {
      ingresos,
      gastos,
      balance: redondear(ingresos - gastos),
      gastos_por_categoria: porCategoria.map((f) => ({
        categoria_id: f.id,
        nombre: f.nombre ?? 'Sin categoría',
        icono: f.icono ?? 'help-circle',
        color: f.color ?? '#94A3B8',
        total: f.total,
      })),
      balance_diario: await balanceDiario(filtros),
      evolucion: await evolucion(filtros),
    };
  },

  ver: leer,

  async crear(input: MovimientoInput): Promise<Movimiento> {
    await validar(input);
    const id = nuevoId();
    await enTransaccion(async () => {
      await insertar('movimientos', { ...datosMovimiento(input), id });
      if (input.programado) await crearProgramacionDesde({ id, fecha: input.fecha }, regla(input));
    });
    notificar(['movimientos', 'programaciones']);
    return leer(id);
  },

  async actualizar(id: string, input: MovimientoInput): Promise<Movimiento> {
    await validar(input);
    await enTransaccion(async () => {
      const anterior = await base().getFirstAsync<{ fecha: string; programacion_id: string | null }>(
        'SELECT fecha, programacion_id FROM movimientos WHERE id = ?',
        id,
      );
      if (!anterior) throw new ErrorDeDatos('Este movimiento ya no existe.');
      await actualizar('movimientos', id, datosMovimiento(input));

      const p = await leerProgramacion(anterior.programacion_id);
      if (!p) {
        if (input.programado) await crearProgramacionDesde({ id, fecha: input.fecha }, regla(input));
        return;
      }

      // Apagar "programado" detiene la repetición; los movimientos se conservan.
      if (input.programado === false) {
        await eliminarProgramacion(p.id);
        return;
      }

      // "Este y los siguientes": los próximos se copian de este movimiento.
      if (input.actualizar_programado) p.movimiento_base_id = id;

      const reglaAnterior = { intervalo: p.intervalo, frecuencia: p.frecuencia };
      if (input.programado) {
        p.intervalo = input.intervalo ?? p.intervalo;
        p.frecuencia = input.frecuencia ?? p.frecuencia;
        if (input.fecha_fin !== undefined) p.fecha_fin = input.fecha_fin;
      }

      const cambioLaRegla = p.intervalo !== reglaAnterior.intervalo || p.frecuencia !== reglaAnterior.frecuencia;
      const cambioElUltimoPago =
        anterior.fecha !== input.fecha && (await ultimoMovimientoDe(p.id))?.id === id;

      if (cambioLaRegla || cambioElUltimoPago) {
        // Vuelve a calcular el calendario desde el último movimiento registrado (o el base).
        const ultimo = await ultimoMovimientoDe(p.id);
        programarDesde(p, ultimo?.fecha ?? input.fecha);
      } else {
        p.activo = !p.fecha_fin || p.proxima_fecha <= p.fecha_fin ? 1 : 0;
      }
      await guardarProgramacion(p);
    });
    notificar(['movimientos', 'programaciones']);
    return leer(id);
  },

  async eliminar(id: string) {
    await enTransaccion(async () => {
      const movimiento = await base().getFirstAsync<{ programacion_id: string | null; fecha_programada: string | null }>(
        'SELECT programacion_id, fecha_programada FROM movimientos WHERE id = ?',
        id,
      );
      if (!movimiento) return;

      const p = await leerProgramacion(movimiento.programacion_id);
      if (p) {
        // Si era el pago del último periodo, ese vencimiento vuelve a quedar pendiente.
        const cambio = movimiento.fecha_programada !== null && deshacerPago(p, movimiento.fecha_programada);

        // Si era el base, el programado sigue con el más reciente que quede; si era el único, se elimina.
        if (p.movimiento_base_id === id) {
          const nuevaBase = await ultimoMovimientoDe(p.id, id);
          if (!nuevaBase) {
            await eliminarProgramacion(p.id);
          } else {
            p.movimiento_base_id = nuevaBase.id;
            await guardarProgramacion(p);
          }
        } else if (cambio) {
          await guardarProgramacion(p);
        }
      }

      // Los comprobantes guardados en el teléfono (cuentas locales); en la nube los borra la API.
      await adjuntosDb.eliminarDe(id);
      await eliminar('movimientos', id);
    });
    notificar(['movimientos', 'programaciones']);
  },
};

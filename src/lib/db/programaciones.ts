import { desplazar, diasEntre, hoy } from '../format';
import type { Frecuencia, Movimiento, PagoInput, Pendiente } from '../types';

import { base, notificar } from './index';
import { aCategoria, type FilaCategoria } from './categorias';
import { actualizar, ErrorDeDatos, eliminar, enTransaccion, insertar, MARCAR_CAMBIO, nuevoId } from './registros';

/*
 * Programados: la misma lógica que tenía la API (App\Models\Programacion).
 * No se registran solos: aparecen como pendientes y el usuario confirma cada
 * pago con el monto real (o lo omite).
 */

export interface FilaProgramacion {
  id: string;
  movimiento_base_id: string | null;
  intervalo: number;
  frecuencia: Frecuencia;
  fecha_inicio: string;
  fecha_fin: string | null;
  ocurrencias: number;
  proxima_fecha: string;
  activo: number;
}

export interface Regla {
  intervalo?: number | null;
  frecuencia?: Frecuencia | null;
  fecha_fin?: string | null;
}

/**
 * Fecha número n del calendario, contada siempre desde fecha_inicio para que un
 * mensual del día 31 no se corra (31 ene → 28 feb → 31 mar).
 */
export const fechaDeOcurrencia = (p: FilaProgramacion, n: number) =>
  desplazar(p.fecha_inicio, n * p.intervalo, p.frecuencia);

const actualizarVigencia = (p: FilaProgramacion) => {
  p.activo = !p.fecha_fin || p.proxima_fecha <= p.fecha_fin ? 1 : 0;
};

/** El último pago es el inicio del calendario: el próximo vencimiento es un periodo después. */
export const programarDesde = (p: FilaProgramacion, ultimaFecha: string) => {
  p.fecha_inicio = ultimaFecha;
  p.ocurrencias = 1;
  p.proxima_fecha = fechaDeOcurrencia(p, 1);
  actualizarVigencia(p);
};

const avanzar = (p: FilaProgramacion, periodos: number) => {
  p.ocurrencias += periodos;
  p.proxima_fecha = fechaDeOcurrencia(p, p.ocurrencias);
  actualizarVigencia(p);
};

/** Cuántos vencimientos ya pasaron sin pagarse (desde el pendiente hasta hoy). */
const periodosVencidos = (p: FilaProgramacion) => {
  const hoyTexto = hoy();
  let vencidos = 0;
  while (vencidos < 120 && fechaDeOcurrencia(p, p.ocurrencias + vencidos) < hoyTexto) vencidos++;
  return vencidos;
};

export async function leerProgramacion(id: string | null) {
  if (!id) return null;
  return base().getFirstAsync<FilaProgramacion>('SELECT * FROM programaciones WHERE id = ?', id);
}

export async function guardarProgramacion(p: FilaProgramacion) {
  const { id, ...valores } = p;
  await actualizar('programaciones', id, valores);
}

/** Movimiento más reciente del programado (por fecha y, en el mismo día, el último registrado). */
export async function ultimoMovimientoDe(programacionId: string, excepto?: string) {
  return base().getFirstAsync<{ id: string; fecha: string }>(
    `SELECT id, fecha FROM movimientos WHERE programacion_id = ? AND id IS NOT ?
     ORDER BY fecha DESC, created_at DESC LIMIT 1`,
    programacionId,
    excepto ?? null,
  );
}

/** Programa los movimientos de `movimiento` y lo enlaza a la nueva programación. Devuelve su id. */
export async function crearProgramacionDesde(movimiento: { id: string; fecha: string }, regla: Regla): Promise<string> {
  if (!regla.frecuencia) throw new ErrorDeDatos('Elige cada cuánto se repite.');

  const p: FilaProgramacion = {
    id: nuevoId(),
    movimiento_base_id: movimiento.id,
    intervalo: regla.intervalo ?? 1,
    frecuencia: regla.frecuencia,
    fecha_inicio: movimiento.fecha,
    fecha_fin: regla.fecha_fin ?? null,
    ocurrencias: 0,
    proxima_fecha: movimiento.fecha,
    activo: 1,
  };
  programarDesde(p, movimiento.fecha);
  await insertar('programaciones', { ...p });
  await actualizar('movimientos', movimiento.id, { programacion_id: p.id });
  return p.id;
}

/** Detiene la repetición: los movimientos se conservan, ya sin programado. */
export async function eliminarProgramacion(id: string) {
  await base().runAsync(
    `UPDATE movimientos SET programacion_id = NULL, ${MARCAR_CAMBIO} WHERE programacion_id = ?`,
    Date.now(),
    id,
  );
  await eliminar('programaciones', id);
}

/** Se borró el pago del último periodo pagado: ese vencimiento vuelve a quedar pendiente. */
export function deshacerPago(p: FilaProgramacion, fechaProgramada: string) {
  if (p.ocurrencias > 1 && fechaProgramada === fechaDeOcurrencia(p, p.ocurrencias - 1)) {
    avanzar(p, -1);
    return true;
  }
  return false;
}

/** Programado activo con su movimiento base, o error si ya terminó. */
async function activa(id: string) {
  const p = await leerProgramacion(id);
  const base_ = p?.movimiento_base_id
    ? await base().getFirstAsync<{ id: string; tipo: Movimiento['tipo']; monto: number; descripcion: string; categoria_id: string | null }>(
        'SELECT id, tipo, monto, descripcion, categoria_id FROM movimientos WHERE id = ?',
        p.movimiento_base_id,
      )
    : null;
  if (!p || !p.activo || !base_) throw new ErrorDeDatos('Este programado ya terminó.');
  return { p, base: base_ };
}

interface FilaPendiente extends FilaProgramacion, Partial<Record<`c_${keyof FilaCategoria}`, string | null>> {
  tipo: Movimiento['tipo'];
  descripcion: string;
  monto: number;
}

export const programacionesDb = {
  /**
   * Vencidos (sin importar la antigüedad), los que vencen en los próximos `dias` (7)
   * y, con `mes`, todos los que vencen hasta el fin de ese mes (para pagar por adelantado).
   */
  async pendientes({ mes, dias = 7 }: { mes?: string; dias?: number } = {}): Promise<Pendiente[]> {
    const hoyTexto = hoy();
    let hasta = desplazar(hoyTexto, dias, 'dias');
    if (mes) {
      const finDeMes = desplazar(desplazar(`${mes}-01`, 1, 'meses'), -1, 'dias');
      if (finDeMes > hasta) hasta = finDeMes;
    }

    const filas = await base().getAllAsync<FilaPendiente>(
      `SELECT p.*, m.tipo, m.descripcion, m.monto,
              c.id AS c_id, c.tipo AS c_tipo, c.nombre AS c_nombre, c.icono AS c_icono, c.color AS c_color
       FROM programaciones p
       JOIN movimientos m ON m.id = p.movimiento_base_id
       LEFT JOIN categorias c ON c.id = m.categoria_id
       WHERE p.activo = 1 AND p.proxima_fecha <= ?
       ORDER BY p.proxima_fecha`,
      hasta,
    );

    return filas.map((f) => {
      const dias_ = diasEntre(hoyTexto, f.proxima_fecha);
      return {
        id: f.id,
        tipo: f.tipo,
        descripcion: f.descripcion,
        monto: f.monto, // estimado: el del último pago
        categoria: aCategoria(f),
        vence: f.proxima_fecha,
        dias: dias_, // negativo = días de atraso
        estado: dias_ < 0 ? 'vencido' : dias_ === 0 ? 'hoy' : 'proximo',
        periodos_vencidos: periodosVencidos(f),
        intervalo: f.intervalo,
        frecuencia: f.frecuencia,
      };
    });
  },

  /**
   * Registra el pago (o el cobro) del vencimiento pendiente con el monto y la fecha
   * reales, y pasa al siguiente periodo. Devuelve el id del movimiento creado.
   */
  async pagar(id: string, pago: PagoInput): Promise<string> {
    const movimientoId = nuevoId();
    await enTransaccion(async () => {
      const { p, base: movimientoBase } = await activa(id);
      await insertar('movimientos', {
        id: movimientoId,
        programacion_id: p.id,
        tipo: movimientoBase.tipo,
        monto: pago.monto,
        descripcion: pago.descripcion || movimientoBase.descripcion,
        categoria_id: movimientoBase.categoria_id,
        fecha: pago.fecha,
        fecha_programada: p.proxima_fecha,
      });

      // "Usar este monto para los próximos": este pago pasa a ser la referencia.
      if (pago.actualizar_base) p.movimiento_base_id = movimientoId;
      avanzar(p, 1);
      await guardarProgramacion(p);
    });
    notificar(['movimientos', 'programaciones']);
    return movimientoId;
  },

  /** El periodo pendiente no aplica (p. ej. no llegó factura): se salta sin registrar nada. */
  async omitir(id: string) {
    await enTransaccion(async () => {
      const { p } = await activa(id);
      avanzar(p, 1);
      await guardarProgramacion(p);
    });
    notificar(['programaciones']);
  },
};

import { desplazar, hoy } from './format';
import type { Evolucion, Movimiento, TipoMovimiento } from './types';

/*
 * El historial descarga todos los movimientos una vez y filtra, suma y agrupa en
 * el teléfono: cambiar un filtro no hace peticiones. Replica lo que calculaba la
 * API (MovimientoController::resumen) para que los resultados sean los mismos.
 */

export interface FiltrosHistorial {
  /** Sin `desde`: desde el primer movimiento ("Todo"). */
  desde?: string;
  hasta: string;
  tipo?: TipoMovimiento;
  q?: string;
}

/** Minúsculas y sin tildes: "Energía" coincide con "energia". */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function filtrar(movimientos: Movimiento[], { desde, hasta, tipo, q }: FiltrosHistorial) {
  const buscado = q ? normalizar(q) : null;
  return movimientos.filter(
    (m) =>
      (!desde || m.fecha >= desde) &&
      m.fecha <= hasta &&
      (!tipo || m.tipo === tipo) &&
      (!buscado || normalizar(m.descripcion).includes(buscado)),
  );
}

export function totales(movimientos: Movimiento[]) {
  let ingresos = 0;
  let gastos = 0;
  for (const m of movimientos) {
    if (m.tipo === 'ingreso') ingresos += m.monto;
    else gastos += m.monto;
  }
  return { ingresos: redondear(ingresos), gastos: redondear(gastos), balance: redondear(ingresos - gastos) };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Días entre dos fechas "YYYY-MM-DD" (en UTC: sin saltos por horario de verano). */
const dias = (desde: string, hasta: string) => (Date.parse(`${hasta}T00:00Z`) - Date.parse(`${desde}T00:00Z`)) / 86_400_000;

const mayor = (a: string, b: string) => (a > b ? a : b);

/**
 * Ingresos y gastos agrupados en el tiempo para el gráfico y la lista agrupada. La
 * agrupación, si no se elige, depende del largo: por día hasta un mes, por semana
 * hasta tres meses, por mes hasta cinco años y por año después. Las semanas se
 * cuentan de 7 en 7 desde el primer día; el primer mes o año puede ser parcial.
 * Los grupos sin movimientos van en 0 y no se pasa de hoy.
 */
export function evolucion(
  filtrados: Movimiento[],
  { desde, hasta }: FiltrosHistorial,
  agrupacionElegida?: Evolucion['agrupacion'],
): Evolucion | null {
  // "Todo": desde el primer movimiento que cumple los filtros.
  const inicio = desde ?? filtrados.reduce<string | null>((min, m) => (!min || m.fecha < min ? m.fecha : min), null);
  if (!inicio) return null;
  const fin = hasta < hoy() ? hasta : hoy();
  if (inicio > fin) return null;

  const largo = dias(inicio, fin) + 1;
  const agrupacion =
    agrupacionElegida ?? (largo <= 31 ? 'dia' : largo <= 92 ? 'semana' : largo <= 366 * 5 ? 'mes' : 'anio');

  const grupoDe = (fecha: string) => {
    switch (agrupacion) {
      case 'dia':
        return fecha;
      case 'semana':
        return desplazar(inicio, Math.floor(dias(inicio, fecha) / 7) * 7, 'dias');
      case 'mes':
        return mayor(`${fecha.slice(0, 7)}-01`, inicio);
      case 'anio':
        return mayor(`${fecha.slice(0, 4)}-01-01`, inicio);
    }
  };

  const puntos = new Map<string, Evolucion['puntos'][number]>();
  for (let cursor = inicio; cursor <= fin; ) {
    const grupo = grupoDe(cursor);
    puntos.set(grupo, { desde: grupo, ingresos: 0, gastos: 0 });
    cursor =
      agrupacion === 'dia'
        ? desplazar(cursor, 1, 'dias')
        : agrupacion === 'semana'
          ? desplazar(cursor, 7, 'dias')
          : agrupacion === 'mes'
            ? desplazar(`${cursor.slice(0, 7)}-01`, 1, 'meses')
            : `${Number(cursor.slice(0, 4)) + 1}-01-01`;
  }

  for (const m of filtrados) {
    if (m.fecha < inicio || m.fecha > fin) continue;
    const punto = puntos.get(grupoDe(m.fecha));
    if (!punto) continue;
    if (m.tipo === 'ingreso') punto.ingresos = redondear(punto.ingresos + m.monto);
    else punto.gastos = redondear(punto.gastos + m.monto);
  }

  return { agrupacion, puntos: [...puntos.values()] };
}

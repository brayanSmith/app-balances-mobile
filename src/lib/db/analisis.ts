import { claveMes, desplazar, diasEntre, hoy } from '../format';
import type { AgrupacionAnalisis, Analisis, PeriodoAnalisis, Proyeccion } from '../types';

import { base } from './index';
import { fechaDeOcurrencia, type FilaProgramacion } from './programaciones';
import { ErrorDeDatos } from './registros';

/*
 * Pantalla "Análisis": el saldo acumulado agrupado por semana, quincena, mes o año
 * (para el gráfico de área y el de velas) y, si se pide, su proyección hasta un mes
 * futuro. La misma lógica que tenía la API (AnalisisController), sobre la base local.
 */

/** Hasta cuántos meses hacia adelante se puede proyectar. */
export const MESES_PROYECCION = 24;

type PorDia = Map<string, { ingresos: number; gastos: number }>;

const redondear = (valor: number) => Math.round(valor * 100) / 100;
const sumar = (porDia: PorDia, campo: 'ingresos' | 'gastos') =>
  redondear([...porDia.values()].reduce((total, d) => total + d[campo], 0));

/** Saldo con el que se llega al período: todo lo registrado antes. */
async function saldoAntesDe(fecha: string) {
  const fila = await base().getFirstAsync<{ saldo: number }>(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS saldo
     FROM movimientos WHERE fecha < ?`,
    fecha,
  );
  return redondear(fila?.saldo ?? 0);
}

async function movimientosPorDia(inicio: string, fin: string, soloNoProgramados = false): Promise<PorDia> {
  if (inicio > fin) return new Map();
  const filas = await base().getAllAsync<{ fecha: string; ingresos: number; gastos: number }>(
    `SELECT fecha,
            SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) AS ingresos,
            SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END) AS gastos
     FROM movimientos
     WHERE fecha >= ? AND fecha <= ? ${soloNoProgramados ? 'AND programacion_id IS NULL' : ''}
     GROUP BY fecha`,
    inicio,
    fin,
  );
  return new Map(filas.map((f) => [f.fecha, { ingresos: f.ingresos, gastos: f.gastos }]));
}

function inicioDePeriodo(dia: string, agrupacion: AgrupacionAnalisis) {
  switch (agrupacion) {
    case 'semana': {
      // De lunes a domingo.
      const [anio, mes, numDia] = dia.split('-').map(Number);
      const desdeLunes = (new Date(anio, mes - 1, numDia).getDay() + 6) % 7;
      return desplazar(dia, -desdeLunes, 'dias');
    }
    case 'quincena':
      return Number(dia.slice(8)) <= 15 ? `${dia.slice(0, 7)}-01` : `${dia.slice(0, 7)}-16`;
    case 'mes':
      return `${dia.slice(0, 7)}-01`;
    case 'anio':
      return `${dia.slice(0, 4)}-01-01`;
  }
}

/**
 * Recorre los días de `inicio` a `fin` acumulando el saldo y arma un período por
 * semana, quincena, mes o año. El primero y el último pueden ser parciales. Cada uno
 * trae sus velas: saldo de apertura, cierre, máximo y mínimo.
 */
function agrupar(
  porDia: PorDia,
  inicio: string,
  fin: string,
  agrupacion: AgrupacionAnalisis,
  saldoInicial: number,
  proyectado: boolean,
): PeriodoAnalisis[] {
  const periodos: PeriodoAnalisis[] = [];
  let actual: PeriodoAnalisis | null = null;
  let saldo = saldoInicial;

  for (let dia = inicio; dia <= fin; dia = desplazar(dia, 1, 'dias')) {
    const inicioPeriodo = inicioDePeriodo(dia, agrupacion);
    const clave = inicioPeriodo > inicio ? inicioPeriodo : inicio;

    if (actual === null || actual.desde !== clave) {
      if (actual !== null) periodos.push(actual);
      actual = {
        desde: clave,
        hasta: clave,
        ingresos: 0,
        gastos: 0,
        apertura: saldo,
        cierre: saldo,
        maximo: saldo,
        minimo: saldo,
        proyectado,
      };
    }

    const movs = porDia.get(dia);
    if (movs) {
      saldo = redondear(saldo + movs.ingresos - movs.gastos);
      actual.ingresos = redondear(actual.ingresos + movs.ingresos);
      actual.gastos = redondear(actual.gastos + movs.gastos);
      actual.maximo = Math.max(actual.maximo, saldo);
      actual.minimo = Math.min(actual.minimo, saldo);
    }
    actual.hasta = dia;
    actual.cierre = saldo;
  }

  if (actual !== null) periodos.push(actual);
  return periodos;
}

/**
 * Ingresos y gastos estimados día a día desde mañana: los vencimientos de los
 * programados (fecha y monto conocidos; los vencidos, mañana) más el promedio
 * diario de lo no programado en el período filtrado.
 */
async function proyectar(
  inicio: string,
  fin: string,
  manana: string,
  finProyeccion: string,
): Promise<[PorDia, Omit<Proyeccion, 'saldo_final'>]> {
  const diasBase = diasEntre(inicio, fin) + 1;
  const historico = await movimientosPorDia(inicio, fin, true);
  const promedio = {
    ingresos: redondear(sumar(historico, 'ingresos') / diasBase),
    gastos: redondear(sumar(historico, 'gastos') / diasBase),
  };

  const diario: PorDia = new Map();
  for (let dia = manana; dia <= finProyeccion; dia = desplazar(dia, 1, 'dias')) diario.set(dia, { ...promedio });

  const programados = { ingresos: 0, gastos: 0, vencimientos: 0 };
  const programaciones = await base().getAllAsync<FilaProgramacion & { tipo: 'ingreso' | 'gasto'; monto: number }>(
    `SELECT p.*, m.tipo, m.monto FROM programaciones p
     JOIN movimientos m ON m.id = p.movimiento_base_id
     WHERE p.activo = 1`,
  );

  for (const p of programaciones) {
    const campo = p.tipo === 'ingreso' ? 'ingresos' : 'gastos';
    for (let n = p.ocurrencias; ; n++) {
      const fecha = fechaDeOcurrencia(p, n);
      if (fecha > finProyeccion || (p.fecha_fin && fecha > p.fecha_fin)) break;
      // Último día del mes proyectando solo ese mes: mañana ya queda fuera.
      const dia = diario.get(fecha > manana ? fecha : manana);
      if (!dia) continue;
      dia[campo] = redondear(dia[campo] + p.monto);
      programados[campo] = redondear(programados[campo] + p.monto);
      programados.vencimientos++;
    }
  }

  return [
    diario,
    {
      hasta: finProyeccion,
      ingresos: sumar(diario, 'ingresos'),
      gastos: sumar(diario, 'gastos'),
      programados,
      promedio_diario: promedio,
      dias_base: diasBase,
    },
  ];
}

export const analisisDb = {
  /** Saldo agrupado (área y velas) y, con `proyectar_hasta` (AAAA-MM), su proyección. */
  async obtener(params: {
    desde: string;
    hasta: string;
    agrupacion: AgrupacionAnalisis;
    proyectar_hasta?: string;
  }): Promise<Analisis> {
    const { desde, hasta, agrupacion, proyectar_hasta: mes } = params;
    const hoyTexto = hoy();
    if (hasta < desde) throw new ErrorDeDatos('La fecha "hasta" debe ser igual o posterior a "desde".');
    if (mes) {
      const maximo = claveMes(new Date(new Date().getFullYear(), new Date().getMonth() + MESES_PROYECCION, 1));
      if (mes < hoyTexto.slice(0, 7)) throw new ErrorDeDatos('Solo se puede proyectar desde el mes actual.');
      if (mes > maximo) throw new ErrorDeDatos(`Se puede proyectar hasta ${MESES_PROYECCION} meses adelante.`);
    }

    // Lo registrado llega como mucho hasta hoy: lo que sigue es proyección.
    const fin = hasta < hoyTexto ? hasta : hoyTexto;
    const saldoInicial = await saldoAntesDe(desde);
    const porDia = await movimientosPorDia(desde, fin);
    const real = agrupar(porDia, desde, fin, agrupacion, saldoInicial, false);
    const saldoActual = real.at(-1)?.cierre ?? saldoInicial;

    let proyeccion: Proyeccion | null = null;
    let proyectados: PeriodoAnalisis[] = [];
    // Solo se proyecta desde hoy: un período que terminó antes dejaría un hueco.
    if (mes && fin === hoyTexto) {
      const manana = desplazar(hoyTexto, 1, 'dias');
      const finProyeccion = desplazar(desplazar(`${mes}-01`, 1, 'meses'), -1, 'dias');
      const [diario, datos] = await proyectar(desde, fin, manana, finProyeccion);
      proyectados = agrupar(diario, manana, finProyeccion, agrupacion, saldoActual, true);
      proyeccion = { ...datos, saldo_final: proyectados.at(-1)?.cierre ?? saldoActual };
    }

    return {
      agrupacion,
      saldo_inicial: saldoInicial,
      saldo_actual: saldoActual,
      ingresos: sumar(porDia, 'ingresos'),
      gastos: sumar(porDia, 'gastos'),
      periodos: [...real, ...proyectados],
      proyeccion,
    };
  },
};

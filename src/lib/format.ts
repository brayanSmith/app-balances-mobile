import type { Frecuencia } from './types';

const moneda =new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const formatearMonto = (valor: number) => moneda.format(valor);

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Mes en formato "YYYY-MM", como lo espera la API. */
export const claveMes = (fecha: Date) => `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`;

export const nombreMes = (fecha: Date) => `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;

/** Fecha en formato "YYYY-MM-DD", como lo espera la API. */
const aTexto = (d: Date) => `${claveMes(d)}-${dosDigitos(d.getDate())}`;

const desdeTexto = (fecha: string) => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
};

export const hoy = () => aTexto(new Date());

export const esFechaValida = (fecha: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(fecha) && aTexto(desdeTexto(fecha)) === fecha;

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const ayer = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return aTexto(d);
};

/** Encabezado de un día en la lista: "Hoy", "Ayer" o "Lunes 20 de octubre". */
export const etiquetaDia = (fecha: string) => {
  if (fecha === hoy()) return 'Hoy';
  if (fecha === ayer()) return 'Ayer';
  const d = desdeTexto(fecha);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
};

/** Mueve una fecha "YYYY-MM-DD" (negativo = hacia atrás). */
export const desplazar = (fecha: string, cantidad: number, frecuencia: Frecuencia) =>
  aTexto(sumar(desdeTexto(fecha), cantidad, frecuencia));

const UNIDADES: Record<Frecuencia, [string, string]> = {
  dias: ['Diario', 'días'],
  semanas: ['Semanal', 'semanas'],
  meses: ['Mensual', 'meses'],
  anios: ['Anual', 'años'],
};

/** (1, meses) → "Mensual" · (2, semanas) → "Cada 2 semanas" */
export const textoRepeticion = (intervalo: number, frecuencia: Frecuencia) =>
  intervalo === 1 ? UNIDADES[frecuencia][0] : `Cada ${intervalo} ${UNIDADES[frecuencia][1]}`;

/** 1536 → "1,5 KB" · 2400000 → "2,3 MB" */
export const formatearTamano = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace('.', ',')} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
};

/** "2026-11-15" → "15 nov 2026" */
export const formatearFechaCorta = (fecha: string) => {
  const d = desdeTexto(fecha);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()} ${d.getFullYear()}`;
};

/** "2026-11-15" → "15 de noviembre de 2026" */
export const formatearFecha = (fecha: string) => {
  const d = desdeTexto(fecha);
  return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
};

// Suma sin desbordar el mes: 31 ene + 1 mes = 28 feb (igual que la API).
function sumar(base: Date, cantidad: number, frecuencia: Frecuencia): Date {
  if (frecuencia === 'dias' || frecuencia === 'semanas') {
    const dias = frecuencia === 'dias' ? cantidad : cantidad * 7;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  }
  const meses = frecuencia === 'meses' ? cantidad : cantidad * 12;
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + meses + 1, 0).getDate();
  return new Date(base.getFullYear(), base.getMonth() + meses, Math.min(base.getDate(), ultimoDia));
}

/**
 * Próximo vencimiento: un periodo después del último pago, igual que la API.
 * Si esa fecha ya pasó, el programado aparece como vencido en Pagos pendientes.
 */
export function proximaFecha(ultimoPago: string, intervalo: number, frecuencia: Frecuencia): string {
  return aTexto(sumar(desdeTexto(ultimoPago), intervalo, frecuencia));
}

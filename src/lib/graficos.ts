/** Ayudantes de los ejes de los gráficos (historial y análisis). */

/** 1.250.000 → "1,3 M"; 45.000 → "45 k". */
export function montoCorto(valor: number) {
  const abs = Math.abs(valor);
  const signo = valor < 0 ? '−' : '';
  const corto = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${signo}${corto(abs / 1_000_000)} M`;
  if (abs >= 1_000) return `${signo}${corto(abs / 1_000)} k`;
  return `${signo}${corto(abs)}`;
}

/** Límites y paso "redondos" del eje Y (0, 500 k, 1 M…) que cubren de min a max. */
export function escalaBonita(min: number, max: number) {
  if (min === max) max = min + 1;
  const pasoCrudo = (max - min) / 3;
  const potencia = 10 ** Math.floor(Math.log10(pasoCrudo));
  const paso = ([1, 2, 2.5, 5, 10].find((f) => f * potencia >= pasoCrudo) ?? 10) * potencia;
  return { min: Math.floor(min / paso) * paso, max: Math.max(paso, Math.ceil(max / paso) * paso), paso };
}

import type { CampoImportacion, FormatoFecha, Frecuencia, MapeoImportacion, TipoMovimiento } from './types';

/*
 * Lee CSV exportados de otras plataformas (bancos, apps, Excel) y convierte cada
 * fila en los datos de un movimiento según un mapeo de columnas. Es la misma lógica
 * que tenía la API (App\Services\ImportadorCsv), sin base de datos.
 */

export const MAX_FILAS = 5000;

/**
 * Datos que se pueden tomar del CSV. Se usa "monto" (+ "tipo" o el signo) o "ingreso"/"gasto".
 * "adjunto" es el nombre del archivo dentro del ZIP (varios separados por |).
 * Programados: "programado" (SI/NO), "intervalo" (cada cuánto: 1, 2, 3…), "periodo"
 * (dias, semanas, meses, anios) y opcionalmente "hasta" una fecha.
 */
export const CAMPOS: CampoImportacion[] = [
  'fecha', 'descripcion', 'monto', 'tipo', 'ingreso', 'gasto', 'categoria', 'adjunto',
  'programado', 'intervalo', 'periodo', 'hasta',
];

/** Nombres de columna habituales para cada dato (sin tildes y en minúscula). */
const SINONIMOS: Record<CampoImportacion, string[]> = {
  fecha: ['fecha', 'date', 'dia', 'fecha transaccion', 'fecha movimiento', 'fecha operacion', 'transaction date'],
  descripcion: ['descripcion', 'concepto', 'detalle', 'description', 'memo', 'nota', 'referencia', 'nombre', 'payee'],
  monto: ['monto', 'valor', 'importe', 'amount', 'cantidad', 'total', 'value'],
  tipo: ['tipo', 'type', 'naturaleza', 'clase', 'movimiento'],
  ingreso: ['ingreso', 'ingresos', 'credito', 'creditos', 'abono', 'abonos', 'entrada', 'income', 'credit', 'deposito'],
  gasto: ['gasto', 'gastos', 'debito', 'debitos', 'cargo', 'cargos', 'salida', 'egreso', 'expense', 'debit', 'retiro'],
  categoria: ['categoria', 'category', 'rubro', 'grupo'],
  adjunto: ['adjunto', 'adjuntos', 'archivo', 'comprobante', 'soporte', 'attachment', 'file', 'foto', 'recibo'],
  programado: ['programado', 'es programado', 'programacion', 'recurrente', 'recurring'],
  intervalo: ['cada cuanto', 'cada', 'intervalo', 'cada cuantos', 'every'],
  periodo: ['tipo periodo', 'tipo de periodo', 'periodo', 'unidad', 'period'],
  hasta: ['hasta', 'fecha fin', 'fin', 'vence', 'repetir hasta', 'until', 'end date'],
};

const SI = ['si', 's', 'x', 'yes', 'y', 'true', '1', 'verdadero'];
const NO = ['', 'no', 'n', '0', 'false', 'falso', '-'];

/** Valores aceptados en "tipo de periodo" (sin tildes, en minúscula). */
const PERIODOS: Record<Frecuencia, string[]> = {
  dias: ['dia', 'dias', 'd', 'day', 'days'],
  semanas: ['semana', 'semanas', 'sem', 'week', 'weeks'],
  meses: ['mes', 'meses', 'm', 'month', 'months'],
  anios: ['anio', 'anios', 'ano', 'anos', 'a', 'year', 'years'],
};

const PALABRAS_INGRESO = ['ingreso', 'income', 'entrada', 'credito', 'abono', 'deposito', 'credit'];
const PALABRAS_GASTO = ['gasto', 'expense', 'egreso', 'salida', 'debito', 'cargo', 'retiro', 'pago', 'compra', 'debit'];

export interface Csv {
  columnas: string[];
  filas: string[][];
}

/** Lo que sale de una fila válida. */
export interface FilaInterpretada {
  fecha: string;
  descripcion: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  adjuntos: string[];
  repetir: { intervalo: number; frecuencia: Frecuencia } | null;
  hasta: string | null;
}

/** "Tipo_Periodo" / "tipo-periodo" / "Tipo período" → "tipo periodo" */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const contiene = (texto: string, palabras: string[]) => palabras.some((p) => p !== '' && texto.includes(p));

/** Como Str::limit de Laravel: corta en `largo` caracteres y agrega `final`. */
function limitar(texto: string, largo: number, final: string) {
  const caracteres = [...texto];
  return caracteres.length <= largo ? texto : caracteres.slice(0, largo).join('').trimEnd() + final;
}

/**
 * Nombre de archivo sin rutas ni caracteres problemáticos. Se usa igual para lo que
 * trae el ZIP y para lo que nombra el CSV, así coinciden.
 */
export function nombreSeguro(nombre: string): string {
  const base = nombre.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  return base.replace(/[\x00-\x1F:*?"<>|]/g, '_').trim();
}

/** Texto del archivo: UTF-8 (con o sin BOM de Excel) o, si no lo es, Windows-1252. */
export function decodificar(bytes: Uint8Array): string {
  const sinBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  return decodificarUtf8(sinBom) ?? decodificarWindows1252(sinBom);
}

/** null si los bytes no son UTF-8 válido. A mano: no todos los motores JS traen TextDecoder. */
function decodificarUtf8(bytes: Uint8Array): string | null {
  const puntos: number[] = [];
  let texto = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const largo = b < 0x80 ? 1 : b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0;
    if (largo === 0 || i + largo > bytes.length) return null;
    let punto = largo === 1 ? b : b & (0xff >> (largo + 1));
    for (let j = 1; j < largo; j++) {
      if ((bytes[i + j] & 0xc0) !== 0x80) return null;
      punto = (punto << 6) | (bytes[i + j] & 0x3f);
    }
    // Formas demasiado largas, sustitutos o fuera de Unicode no son UTF-8 válido.
    if ((largo === 3 && (punto < 0x800 || (punto >= 0xd800 && punto <= 0xdfff))) || (largo === 4 && (punto < 0x10000 || punto > 0x10ffff))) {
      return null;
    }
    puntos.push(punto);
    i += largo;
    // De a trozos: String.fromCodePoint con muchos argumentos desborda la pila.
    if (puntos.length >= 8192) texto += String.fromCodePoint(...puntos.splice(0));
  }
  return texto + String.fromCodePoint(...puntos);
}

// Windows-1252 es Latin-1 salvo 0x80–0x9F (comillas tipográficas, €, …).
const CP1252 =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

function decodificarWindows1252(bytes: Uint8Array) {
  let texto = '';
  for (const b of bytes) texto += b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b);
  return texto;
}

/** Separador de columnas: el que más se repite en la primera línea (a igualdad, la coma). */
function detectarDelimitador(linea: string) {
  let mejor = ',';
  let maximo = 0;
  for (const delimitador of [',', ';', '\t', '|']) {
    const conteo = linea.split(delimitador).length - 1;
    if (conteo > maximo) {
      mejor = delimitador;
      maximo = conteo;
    }
  }
  return mejor;
}

/** Respeta comillas, comillas dobles ("") y saltos de línea dentro de un campo. */
function separarFilas(texto: string, delimitador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c !== '"') campo += c;
      else if (texto[i + 1] === '"') campo += texto[++i];
      else enComillas = false;
    } else if (c === '"' && campo.trim() === '') {
      enComillas = true;
    } else if (c === delimitador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/** Encabezados vacíos o repetidos: "Columna 3", "Monto (2)". */
function nombrarColumnas(encabezado: string[]): string[] {
  const nombres: string[] = [];
  encabezado.forEach((original, i) => {
    const base = original.trim() || `Columna ${i + 1}`;
    let nombre = base;
    for (let n = 2; nombres.includes(nombre); n++) nombre = `${base} (${n})`;
    nombres.push(nombre);
  });
  return nombres;
}

export function leerCsv(bytes: Uint8Array): Csv {
  const contenido = decodificar(bytes);
  const delimitador = detectarDelimitador(contenido.split(/[\r\n]/, 1)[0] ?? '');
  const filas = separarFilas(contenido, delimitador)
    .filter((fila) => fila.join('') !== '') // líneas vacías
    .map((fila) => fila.map((valor) => valor.trim()));
  const encabezado = filas.shift() ?? [];
  return { columnas: nombrarColumnas(encabezado), filas };
}

/** Adivina qué columna corresponde a cada dato a partir del encabezado. */
export function sugerirMapeo(columnas: string[]): MapeoImportacion {
  const normalizadas = columnas.map(normalizar);
  const mapeo = Object.fromEntries(CAMPOS.map((c) => [c, null])) as MapeoImportacion;
  const usadas = new Set<number>();

  // Primero coincidencias exactas, luego columnas que contengan la palabra.
  for (const exacta of [true, false]) {
    for (const campo of CAMPOS) {
      if (mapeo[campo] !== null) continue;
      const i = normalizadas.findIndex(
        (nombre, j) => !usadas.has(j) && (exacta ? SINONIMOS[campo].includes(nombre) : contiene(nombre, SINONIMOS[campo])),
      );
      if (i >= 0) {
        mapeo[campo] = columnas[i];
        usadas.add(i);
      }
    }
  }

  // Con columnas de crédito/débito no hace falta un monto único (y al revés).
  if (mapeo.monto !== null && (mapeo.ingreso !== null || mapeo.gasto !== null)) {
    mapeo.ingreso = null;
    mapeo.gasto = null;
  }
  return mapeo;
}

/** "2026-10-05 08:30" / "05/10/2026" / "5.10.26" → ['2026','10','05'] / ['05','10','2026'] */
function partesFecha(texto: string): [string, string, string] | null {
  const m = texto.trim().match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{2,4})/);
  return m ? [m[1], m[2], m[3]] : null;
}

export function sugerirFormatoFecha(filas: string[][], columna: number | null): FormatoFecha {
  if (columna === null) return 'd/m/Y';
  for (const fila of filas.slice(0, 50)) {
    const partes = partesFecha(fila[columna] ?? '');
    if (!partes) continue;
    if (partes[0].length === 4) return 'Y-m-d';
    if (Number(partes[0]) > 12) return 'd/m/Y';
    if (Number(partes[1]) > 12) return 'm/d/Y';
  }
  return 'd/m/Y'; // lo habitual en Latinoamérica
}

function fecha(texto: string, formato: FormatoFecha): string | null {
  const partes = partesFecha(texto);
  if (!partes) return null;

  let [anio, mes, dia] =
    partes[0].length === 4 // AAAA-MM-DD sirve con cualquier formato
      ? partes
      : formato === 'm/d/Y'
        ? [partes[2], partes[0], partes[1]]
        : [partes[2], partes[1], partes[0]];
  if (anio.length === 2) anio = `20${anio}`;

  const [a, m, d] = [Number(anio), Number(mes), Number(dia)];
  const prueba = new Date(Date.UTC(2000, m - 1, d));
  prueba.setUTCFullYear(a);
  if (a < 1 || m < 1 || m > 12 || prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d) return null;

  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "$ 1.234.567,50" → 1234567.5 · "1,234.50" → 1234.5 · "(120.000)" → -120000 */
export function monto(entrada: string): number | null {
  const texto = entrada.trim();
  if (texto === '') return null;

  const negativo =
    texto.startsWith('-') || texto.endsWith('-') || (texto.startsWith('(') && texto.endsWith(')'));
  let numero = texto.replace(/[^\d.,]/g, '');

  const punto = numero.lastIndexOf('.');
  const coma = numero.lastIndexOf(',');
  if (punto >= 0 && coma >= 0) {
    // El último separador es el decimal; el otro, de miles.
    const [miles, decimal] = coma > punto ? ['.', ','] : [',', '.'];
    numero = numero.split(miles).join('').replace(decimal, '.');
  } else if (coma >= 0) {
    numero = /^\d{1,3}(,\d{3})+$/.test(numero) ? numero.replace(/,/g, '') : numero.replace(/,/g, '.');
  } else if (punto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(numero)) {
    numero = numero.replace(/\./g, ''); // "120.000" son miles (pesos)
  }

  if (!/^(\d+\.?\d*|\.\d+)$/.test(numero)) return null;
  return (negativo ? -1 : 1) * Number(numero);
}

/**
 * programado=SI, cada cuánto=2, tipo de periodo=meses → { intervalo: 2, frecuencia: meses }.
 * programado vacío o NO → sin programación (las otras columnas se ignoran).
 */
export function programacion(
  programado: string,
  cadaCuanto: string,
  periodo: string,
): [FilaInterpretada['repetir'], string | null] {
  const valor = normalizar(programado);
  if (NO.includes(valor)) return [null, null];
  if (!SI.includes(valor)) return [null, `Programado debe ser SI o NO (dice "${valor}")`];

  const cada = cadaCuanto.trim();
  if (cada !== '' && (!/^\d+$/.test(cada) || Number(cada) < 1 || Number(cada) > 365)) {
    return [null, `Cada cuánto debe ser un número entero entre 1 y 365 (dice "${cada}")`];
  }

  const normalizado = normalizar(periodo);
  const frecuencia = (Object.keys(PERIODOS) as Frecuencia[]).find((f) => PERIODOS[f].includes(normalizado));
  if (!frecuencia) {
    return [
      null,
      normalizado === ''
        ? 'Falta el tipo de periodo: dias, semanas, meses o anios'
        : `Tipo de periodo no válido: "${periodo}" (usa dias, semanas, meses o anios)`,
    ];
  }

  return [{ intervalo: cada === '' ? 1 : Number(cada), frecuencia }, null];
}

function tipo(texto: string): TipoMovimiento | null {
  const signo = texto.trim(); // antes de normalizar, que convierte "-" en espacio
  const normalizado = normalizar(texto);
  if (signo === '+' || contiene(normalizado, PALABRAS_INGRESO)) return 'ingreso';
  if (signo === '-' || contiene(normalizado, PALABRAS_GASTO)) return 'gasto';
  return null;
}

/** Convierte una fila en datos de movimiento, o explica por qué no se puede. */
export function interpretar(
  fila: string[],
  columnas: string[],
  mapeo: MapeoImportacion,
  formatoFecha: FormatoFecha,
): [FilaInterpretada | null, string | null] {
  const valor = (campo: CampoImportacion) => {
    const columna = mapeo[campo];
    const indice = columna === null ? -1 : columnas.indexOf(columna);
    return indice < 0 ? '' : (fila[indice] ?? '');
  };

  const laFecha = fecha(valor('fecha'), formatoFecha);
  if (laFecha === null) return [null, `Fecha inválida: "${valor('fecha')}"`];

  const descripcion = limitar(valor('descripcion'), 250, '…');
  if (descripcion === '') return [null, 'Falta la descripción'];

  let elMonto: number;
  let elTipo: TipoMovimiento;
  if (mapeo.monto !== null) {
    const leido = monto(valor('monto'));
    if (leido === null) return [null, `Monto inválido: "${valor('monto')}"`];
    elMonto = leido;
    if (mapeo.tipo !== null) {
      const leidoTipo = tipo(valor('tipo'));
      if (leidoTipo === null) return [null, `Tipo no reconocido: "${valor('tipo')}" (usa ingreso o gasto)`];
      elTipo = leidoTipo;
    } else {
      elTipo = leido < 0 ? 'gasto' : 'ingreso'; // el signo decide
    }
  } else {
    const ingreso = Math.abs(monto(valor('ingreso')) ?? 0);
    const gasto = Math.abs(monto(valor('gasto')) ?? 0);
    [elTipo, elMonto] = ingreso > 0 ? ['ingreso', ingreso] : ['gasto', gasto];
  }

  elMonto = Math.round(Math.abs(elMonto) * 100) / 100;
  if (elMonto === 0) return [null, 'El monto es 0'];

  const [repetir, errorRepetir] = programacion(valor('programado'), valor('intervalo'), valor('periodo'));
  if (errorRepetir) return [null, errorRepetir];

  let hasta: string | null = null;
  if (repetir && valor('hasta') !== '') {
    hasta = fecha(valor('hasta'), formatoFecha);
    if (hasta === null || hasta <= laFecha) {
      return [null, `Fecha "hasta" inválida o anterior a la fecha: "${valor('hasta')}"`];
    }
  }

  const categoria = valor('categoria');
  const adjuntos = valor('adjunto').split(/[|\n]+/).map(nombreSeguro).filter(Boolean);

  return [
    {
      fecha: laFecha,
      descripcion,
      tipo: elTipo,
      monto: elMonto,
      categoria: categoria === '' ? null : limitar(categoria, 50, ''),
      adjuntos,
      repetir,
      hasta,
    },
    null,
  ];
}

export type TipoMovimiento = 'ingreso' | 'gasto';

export type Frecuencia = 'dias' | 'semanas' | 'meses' | 'anios';

export interface User {
  id: number;
  name: string;
  email: string;
  /** Enlace firmado a la foto de perfil (dura una semana), o null. */
  foto_url: string | null;
}

export interface Categoria {
  id: number;
  tipo: TipoMovimiento;
  nombre: string;
  icono: string; // nombre de un ícono de Ionicons
  color: string; // #RRGGBB
}

export type CategoriaInput = Omit<Categoria, 'id'>;

/** Regla de repetición de un movimiento programado. */
export interface Programacion {
  id: number;
  intervalo: number; // cada N...
  frecuencia: Frecuencia; // ...días/semanas/meses/años
  fecha_fin: string | null;
  proxima_fecha: string; // YYYY-MM-DD
  activo: boolean;
  es_base: boolean; // los próximos se copian de este movimiento
}

/** Comprobante guardado en la API. `url` es un enlace firmado que vence en 30 min. */
export interface Adjunto {
  id: number;
  nombre: string;
  mime: string;
  tamano: number;
  es_imagen: boolean;
  url: string;
}

/** Archivo elegido en el celular/navegador que aún no se ha subido. */
export interface ArchivoLocal {
  uri: string;
  nombre: string;
  mime: string;
  file?: File; // solo en web
}

export interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  monto: number;
  descripcion: string;
  categoria: Categoria | null;
  fecha: string; // YYYY-MM-DD
  /** Si es el pago de un programado: el vencimiento que cubre. */
  fecha_programada: string | null;
  adjuntos?: Adjunto[]; // solo al ver un movimiento
  adjuntos_count: number;
  programado: boolean;
  programacion: Programacion | null;
  /** Solo en la app: registrado y todavía en la cola (aún no está en la API). */
  local?: {
    error: string | null;
    /** Con internet se está enviando ahora; sin ella, espera la conexión. */
    enviando?: boolean;
  };
}

/** Filtros del listado y del resumen (ver MovimientoController::filtrados). */
export interface FiltrosMovimientos {
  mes?: string; // YYYY-MM
  desde?: string; // YYYY-MM-DD
  hasta?: string;
  tipo?: TipoMovimiento;
  q?: string;
  /** Agrupación del gráfico de evolución; sin ella la API elige según el largo. */
  agrupacion?: 'dia' | 'semana' | 'mes' | 'anio';
}

/** Programado con un vencimiento por pagar (o por recibir, si es ingreso). */
export interface Pendiente {
  id: number; // id de la programación
  tipo: TipoMovimiento;
  descripcion: string;
  monto: number; // estimado: el del último pago
  categoria: Categoria | null;
  vence: string; // YYYY-MM-DD
  dias: number; // negativo = días de atraso
  estado: 'vencido' | 'hoy' | 'proximo';
  periodos_vencidos: number;
  intervalo: number;
  frecuencia: Frecuencia;
}

export interface PagoInput {
  monto: number;
  fecha: string;
  actualizar_base: boolean;
  cliente_id?: string;
}

/** Datos que se pueden tomar de una columna del CSV a importar. */
export type CampoImportacion =
  | 'fecha'
  | 'descripcion'
  | 'monto'
  | 'tipo'
  | 'ingreso'
  | 'gasto'
  | 'categoria'
  | 'adjunto'
  | 'programado'
  | 'intervalo'
  | 'periodo'
  | 'hasta';
export type MapeoImportacion = Record<CampoImportacion, string | null>;
export type FormatoFecha = 'Y-m-d' | 'd/m/Y' | 'm/d/Y';

/** Adjunto nombrado en el CSV que no está en el ZIP/RAR. */
export interface AdjuntoFaltante {
  fila: number;
  nombre: string;
}

export interface Previsualizacion {
  columnas: string[];
  /** Hasta 3 valores de ejemplo por columna. */
  muestras: Record<string, string[]>;
  mapeo: MapeoImportacion;
  formato_fecha: FormatoFecha;
  total_filas: number;
  validas: number;
  con_error: number;
  vista_previa: {
    fila: number;
    datos: {
      fecha: string;
      descripcion: string;
      tipo: TipoMovimiento;
      monto: number;
      categoria: string | null;
      adjuntos: string[];
      repetir: { intervalo: number; frecuencia: Frecuencia } | null;
      hasta: string | null;
    } | null;
    error: string | null;
    adjuntos: { nombre: string; encontrado: boolean }[];
  }[];
  adjuntos: { referenciados: number; encontrados: number; faltantes: AdjuntoFaltante[] };
}

/** ZIP/RAR ya subido y extraído en la API; se usa por su token. */
export interface ComprimidoSubido {
  token: string;
  nombre: string;
  archivos: number;
  omitidos: string[];
}

export interface Importacion {
  id: number;
  archivo: string;
  filas: number;
  importados: number;
  duplicados: number;
  omitidos: number;
  creada: string; // ISO 8601
}

export interface ResultadoImportacion {
  importacion: Importacion;
  importados: number;
  duplicados: number;
  omitidos: number;
  categorias_creadas: string[];
  adjuntos_importados: number;
  adjuntos_faltantes: AdjuntoFaltante[];
  programaciones_creadas: number;
}

export interface Pagina<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

export type MovimientoInput = Pick<Movimiento, 'tipo' | 'monto' | 'descripcion' | 'fecha'> & {
  categoria_id: number | null;
  programado?: boolean;
  intervalo?: number | null;
  frecuencia?: Frecuencia | null;
  fecha_fin?: string | null;
  actualizar_programado?: boolean; // "este y los siguientes"
  cliente_id?: string; // id generado en la app: reenviarlo no duplica
};

export interface GastoPorCategoria {
  categoria_id: number | null;
  nombre: string;
  icono: string;
  color: string;
  total: number;
}

export interface Resumen {
  ingresos: number;
  gastos: number;
  balance: number;
  gastos_por_categoria: GastoPorCategoria[];
  /** Balance acumulado día a día del período (para el minigráfico). */
  balance_diario: { fecha: string; balance: number }[];
  /** Ingresos y gastos agrupados en el tiempo (solo con desde/hasta: historial). */
  evolucion?: Evolucion | null;
}

export interface Evolucion {
  agrupacion: 'dia' | 'semana' | 'mes' | 'anio';
  /** `desde` = primer día del grupo. Los grupos sin movimientos vienen en 0. */
  puntos: { desde: string; ingresos: number; gastos: number }[];
}

export type AgrupacionAnalisis = 'semana' | 'quincena' | 'mes' | 'anio';

/** Una semana, quincena, mes o año del análisis, con sus velas del saldo acumulado. */
export interface PeriodoAnalisis {
  desde: string;
  hasta: string;
  ingresos: number;
  gastos: number;
  /** Saldo al empezar, al terminar y el más alto y más bajo dentro del período. */
  apertura: number;
  cierre: number;
  maximo: number;
  minimo: number;
  /** Estimado (después de hoy), no registrado. */
  proyectado: boolean;
}

export interface Proyeccion {
  hasta: string;
  ingresos: number;
  gastos: number;
  saldo_final: number;
  /** Vencimientos de los programados que caen hasta `hasta` (los vencidos cuentan mañana). */
  programados: { ingresos: number; gastos: number; vencimientos: number };
  /** Promedio diario de lo no programado en el período filtrado. */
  promedio_diario: { ingresos: number; gastos: number };
  dias_base: number;
}

export interface Analisis {
  agrupacion: AgrupacionAnalisis;
  saldo_inicial: number;
  saldo_actual: number;
  ingresos: number;
  gastos: number;
  periodos: PeriodoAnalisis[];
  proyeccion: Proyeccion | null;
}

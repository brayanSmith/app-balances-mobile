/*
 * Esquema de la base local. Cada entrada corre una sola vez y en orden (ver migrar()
 * en index.ts): para cambiar algo se agrega una nueva al final, nunca se edita una vieja.
 *
 * Mismas tablas que sincroniza la API (categorias, programaciones, movimientos), sin
 * tenant ni usuario porque la base es de una sola cuenta. Los ids son el uuid que
 * genera la app; las relaciones no llevan llave foránea porque la sincronización
 * puede traer un registro antes que el que lo referencia.
 *
 * Columnas de control:
 * - _estado: 'sincronizado' | 'creado' | 'actualizado' (lo que falta enviar a la API).
 * - created_at / updated_at: milisegundos.
 * - _eliminados: borrados pendientes de enviar. _sync: último pull, etc.
 */
export const MIGRACIONES: string[] = [
  `
  CREATE TABLE categorias (
    id TEXT PRIMARY KEY NOT NULL,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    icono TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    _estado TEXT NOT NULL DEFAULT 'creado'
  );

  CREATE TABLE programaciones (
    id TEXT PRIMARY KEY NOT NULL,
    movimiento_base_id TEXT,
    intervalo INTEGER NOT NULL DEFAULT 1,
    frecuencia TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT,
    ocurrencias INTEGER NOT NULL DEFAULT 0,
    proxima_fecha TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    _estado TEXT NOT NULL DEFAULT 'creado'
  );
  CREATE INDEX programaciones_pendientes ON programaciones (activo, proxima_fecha);

  CREATE TABLE movimientos (
    id TEXT PRIMARY KEY NOT NULL,
    categoria_id TEXT,
    programacion_id TEXT,
    tipo TEXT NOT NULL,
    monto REAL NOT NULL,
    descripcion TEXT NOT NULL,
    fecha TEXT NOT NULL,
    fecha_programada TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    _estado TEXT NOT NULL DEFAULT 'creado'
  );
  CREATE INDEX movimientos_fecha ON movimientos (fecha);
  CREATE INDEX movimientos_programacion ON movimientos (programacion_id);

  CREATE TABLE _eliminados (
    tabla TEXT NOT NULL,
    id TEXT NOT NULL,
    PRIMARY KEY (tabla, id)
  );

  CREATE TABLE _sync (
    clave TEXT PRIMARY KEY NOT NULL,
    valor TEXT
  );
  `,

  // Cuántos comprobantes tiene en la API (viene de /api/sync; los archivos se suben aparte).
  `ALTER TABLE movimientos ADD COLUMN adjuntos_count INTEGER NOT NULL DEFAULT 0;`,

  // Comprobantes de las cuentas que guardan solo en el teléfono (no se sincronizan).
  // remoto_id: el id que tenía en la API si se bajó al pasar de la nube al teléfono.
  `
  CREATE TABLE adjuntos (
    id TEXT PRIMARY KEY NOT NULL,
    movimiento_id TEXT NOT NULL,
    remoto_id INTEGER,
    nombre TEXT NOT NULL,
    mime TEXT NOT NULL,
    tamano INTEGER NOT NULL,
    uri TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX adjuntos_movimiento ON adjuntos (movimiento_id);
  `,

  // Historial de CSV importados en este teléfono, para poder deshacerlos (no se sincroniza).
  `
  CREATE TABLE importaciones (
    id TEXT PRIMARY KEY NOT NULL,
    archivo TEXT NOT NULL,
    filas INTEGER NOT NULL,
    importados INTEGER NOT NULL,
    duplicados INTEGER NOT NULL,
    omitidos INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  ALTER TABLE movimientos ADD COLUMN importacion_id TEXT;
  CREATE INDEX movimientos_importacion ON movimientos (importacion_id);
  `,

  // En web no hay sistema de archivos: los comprobantes locales se guardan aquí (uri queda vacía).
  `ALTER TABLE adjuntos ADD COLUMN datos BLOB;`,
];

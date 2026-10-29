import type { Categoria, CategoriaInput } from '../types';

import { base, notificar } from './index';
import { actualizar, ErrorDeDatos, eliminar, enTransaccion, insertar, MARCAR_CAMBIO, nuevoId } from './registros';

export interface FilaCategoria {
  id: string;
  tipo: Categoria['tipo'];
  nombre: string;
  icono: string;
  color: string;
}

/** Columnas de la categoría unida a otra consulta (c.id AS c_id, ...). */
export const COLUMNAS_CATEGORIA = 'c.id AS c_id, c.tipo AS c_tipo, c.nombre AS c_nombre, c.icono AS c_icono, c.color AS c_color';

/** La categoría de una fila con COLUMNAS_CATEGORIA, o null si no tiene. */
export function aCategoria(fila: Partial<Record<`c_${keyof FilaCategoria}`, string | null>>): Categoria | null {
  if (!fila.c_id) return null;
  return {
    id: fila.c_id,
    tipo: fila.c_tipo as Categoria['tipo'],
    nombre: fila.c_nombre ?? '',
    icono: fila.c_icono ?? '',
    color: fila.c_color ?? '',
  };
}

/** Categorías con las que arranca una cuenta (las mismas de la API, Categoria::PREDETERMINADAS). */
const PREDETERMINADAS: CategoriaInput[] = [
  { tipo: 'gasto', nombre: 'Comida', icono: 'fast-food', color: '#F97316' },
  { tipo: 'gasto', nombre: 'Transporte', icono: 'bus', color: '#3B82F6' },
  { tipo: 'gasto', nombre: 'Vivienda', icono: 'home', color: '#8B5CF6' },
  { tipo: 'gasto', nombre: 'Servicios', icono: 'flash', color: '#EAB308' },
  { tipo: 'gasto', nombre: 'Salud', icono: 'medkit', color: '#EF4444' },
  { tipo: 'gasto', nombre: 'Compras', icono: 'cart', color: '#14B8A6' },
  { tipo: 'gasto', nombre: 'Ocio', icono: 'game-controller', color: '#EC4899' },
  { tipo: 'gasto', nombre: 'Educación', icono: 'school', color: '#6366F1' },
  { tipo: 'gasto', nombre: 'Otros', icono: 'pricetag', color: '#64748B' },
  { tipo: 'ingreso', nombre: 'Salario', icono: 'briefcase', color: '#10B981' },
  { tipo: 'ingreso', nombre: 'Ventas', icono: 'storefront', color: '#22C55E' },
  { tipo: 'ingreso', nombre: 'Freelance', icono: 'laptop', color: '#06B6D4' },
  { tipo: 'ingreso', nombre: 'Inversiones', icono: 'trending-up', color: '#0EA5E9' },
  { tipo: 'ingreso', nombre: 'Otros', icono: 'cash', color: '#64748B' },
];

/** Igual que la regla unique de la API: no se repite el nombre dentro del mismo tipo. */
async function validarNombre(input: CategoriaInput, excepto?: string) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new ErrorDeDatos('Escribe un nombre para la categoría.');
  const repetida = await base().getFirstAsync(
    'SELECT 1 FROM categorias WHERE tipo = ? AND nombre = ? COLLATE NOCASE AND id IS NOT ?',
    input.tipo,
    nombre,
    excepto ?? null,
  );
  if (repetida) throw new ErrorDeDatos('Ya existe una categoría con ese nombre.');
  return nombre;
}

export const categoriasDb = {
  listar: () =>
    base().getAllAsync<Categoria>(
      'SELECT id, tipo, nombre, icono, color FROM categorias ORDER BY tipo, nombre COLLATE NOCASE',
    ),

  async crear(input: CategoriaInput): Promise<Categoria> {
    const categoria = { ...input, id: nuevoId(), nombre: await validarNombre(input) };
    await insertar('categorias', categoria);
    notificar(['categorias']);
    return categoria;
  },

  async actualizar(id: string, input: CategoriaInput): Promise<Categoria> {
    const categoria = { ...input, nombre: await validarNombre(input, id) };
    await actualizar('categorias', id, categoria);
    notificar(['categorias', 'movimientos']);
    return { ...categoria, id };
  },

  /** Los movimientos de la categoría se conservan, quedan sin categoría. */
  async eliminar(id: string) {
    await enTransaccion(async () => {
      await base().runAsync(
        `UPDATE movimientos SET categoria_id = NULL, ${MARCAR_CAMBIO} WHERE categoria_id = ?`,
        Date.now(),
        id,
      );
      await eliminar('categorias', id);
    });
    notificar(['categorias', 'movimientos']);
  },

  /** Cuenta nueva que guarda solo en el dispositivo: arranca con las predeterminadas. */
  async crearPredeterminadas() {
    await enTransaccion(async () => {
      for (const categoria of PREDETERMINADAS) await insertar('categorias', { ...categoria, id: nuevoId() });
    });
    notificar(['categorias']);
  },
};

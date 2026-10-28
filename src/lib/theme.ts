import type { Ionicons } from '@expo/vector-icons';

export type NombreIcono = keyof typeof Ionicons.glyphMap;

export type Paleta = typeof claro;

// Marca en verdes "dinero"; los grises tienen un leve tinte verde para que combinen.
const claro = {
  fondo: '#F3F6F4',
  tarjeta: '#FFFFFF',
  superficie: '#E8EFEA', // fondo de campos, chips y selectores
  texto: '#0F1F17',
  textoSuave: '#5F6F66',
  borde: '#DCE5DF',
  primario: '#059669',
  primarioSuave: '#D1FAE5',
  ingreso: '#16A34A',
  ingresoSuave: '#DCFCE7',
  gasto: '#DC2626',
  gastoSuave: '#FEE2E2',
  aviso: '#D97706', // vence hoy / por vencer
  avisoSuave: '#FEF3C7',
  sombra: '0px 6px 20px rgba(15, 31, 23, 0.08)',
};

const oscuro: Paleta = {
  fondo: '#0A100D',
  tarjeta: '#141C18',
  superficie: '#1E2823',
  texto: '#ECF3EF',
  textoSuave: '#94A39B',
  borde: '#26332C',
  primario: '#10B981',
  primarioSuave: '#0F2E24',
  ingreso: '#4ADE80',
  ingresoSuave: '#0F2E1A',
  gasto: '#F87171',
  gastoSuave: '#3B1515',
  aviso: '#FBBF24',
  avisoSuave: '#3A2A0A',
  sombra: '0px 6px 20px rgba(0, 0, 0, 0.35)',
};

export const paletas = { claro, oscuro };

/**
 * Esquinas: sobrias. xs etiquetas, sm chips, md filas/campos/botones,
 * lg tarjetas, hojas y menú. Lo que es círculo (íconos, avatar, +) sigue siéndolo.
 */
export const radio = { xs: 4, sm: 6, md: 8, lg: 12 };

/** Degradado de la marca (botón principal, login) y del balance positivo. Igual en ambos modos. */
export const degradado = ['#047857', '#10B981'] as const;

/** Degradado del balance cuando el mes queda en negativo. */
export const degradadoNegativo = ['#B91C1C', '#EF4444'] as const;

/** "#RRGGBB" + opacidad → "#RRGGBBAA" */
export const conAlpha = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

/** Colores que se pueden elegir para una categoría. */
export const PALETA = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
  '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
  '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E', '#78716C', '#64748B',
];

/** Íconos (Ionicons) que se pueden elegir para una categoría. */
export const ICONOS: NombreIcono[] = [
  'fast-food', 'restaurant', 'cafe', 'pizza', 'beer', 'cart',
  'basket', 'bag-handle', 'shirt', 'home', 'bed', 'flash',
  'water', 'flame', 'wifi', 'phone-portrait', 'tv', 'car',
  'bus', 'bicycle', 'airplane', 'train', 'medkit', 'fitness',
  'heart', 'paw', 'school', 'book', 'game-controller', 'film',
  'musical-notes', 'gift', 'card', 'cash', 'wallet', 'briefcase',
  'laptop', 'storefront', 'trending-up', 'construct', 'leaf', 'people',
  'happy', 'barbell', 'umbrella', 'globe', 'receipt', 'pricetag',
];

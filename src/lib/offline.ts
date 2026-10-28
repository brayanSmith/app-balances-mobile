import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { isAxiosError } from 'axios';

/*
 * Base del modo sin conexión:
 * - saber si hay internet (NetInfo),
 * - guardar la última respuesta de cada pantalla para mostrarla sin red.
 */

// "Hay conexión" = la API responde (GET /api/ping), no solo que haya Wi-Fi.
NetInfo.configure({
  reachabilityUrl: `${process.env.EXPO_PUBLIC_API_URL}/ping`,
  reachabilityTest: async (respuesta) => respuesta.status === 200,
  reachabilityShortTimeout: 5 * 1000,
  reachabilityLongTimeout: 60 * 1000,
});

let conRed = true;
NetInfo.addEventListener((estado) => {
  conRed = estado.isConnected !== false;
});

/**
 * false solo si el dispositivo no tiene ninguna red (modo avión, sin Wi-Fi ni datos).
 * Si hay red, siempre se intenta la petición: el chequeo de NetInfo contra la API
 * puede ir atrasado y dejaría la app mostrando datos viejos con el servidor ya arriba.
 */
export const hayConexion = () => conRed;

/** La API no respondió: sin red, señal caída o servidor inalcanzable. */
export const esErrorDeRed = (error: unknown) => isAxiosError(error) && !error.response;

export class SinConexionError extends Error {
  constructor() {
    super('Sin conexión y todavía no hay datos guardados en este dispositivo.');
    this.name = 'SinConexionError';
  }
}

const PREFIJO = 'cache:';
// Lo que ya se pidió se reutiliza sin volver a la API durante este tiempo, salvo que
// algo cambie antes (ver invalidarCache). El límite trae lo registrado desde otro
// dispositivo y recalcula los vencimientos ("vence hoy", "vencido").
const VIGENCIA = 10 * 60 * 1000;

export interface ConCache<T> {
  datos: T;
  /** null = datos al día; si no, cuándo se guardó la copia sin conexión que se muestra. */
  guardadoEn: number | null;
}

/*
 * Dos niveles, ambos separados por usuario (cada usuario tiene su propio balance):
 * - memoria: lo pedido en esta sesión de la app; se muestra al instante, sin petición.
 * - AsyncStorage: copia persistente, solo para mostrar algo cuando no hay conexión.
 */
let usuario: number | null = null;
const memoria = new Map<string, { datos: unknown; pedidoEn: number }>();

/** Lo llama la sesión al entrar o cambiar de cuenta: la caché de otro usuario no se usa. */
export function usarCacheDe(id: number | null) {
  if (id === usuario) return;
  usuario = id;
  memoria.clear();
}

const claveGuardada = (clave: string) => `${PREFIJO}${usuario ?? 'anonimo'}:${clave}`;

/**
 * Devuelve los datos de la memoria si siguen vigentes; si no, los pide a la API y
 * guarda una copia. Sin conexión devuelve la última copia guardada (o lanza
 * SinConexionError si nunca se cargó). `forzar` ignora la memoria (deslizar para recargar).
 */
export async function conCache<T>(
  clave: string,
  pedir: () => Promise<T>,
  { forzar = false }: { forzar?: boolean } = {},
): Promise<ConCache<T>> {
  const enMemoria = memoria.get(clave);
  if (!forzar && enMemoria && Date.now() - enMemoria.pedidoEn < VIGENCIA) {
    return { datos: enMemoria.datos as T, guardadoEn: null };
  }

  if (hayConexion()) {
    try {
      const datos = await pedir();
      const pedidoEn = Date.now();
      memoria.set(clave, { datos, pedidoEn });
      AsyncStorage.setItem(claveGuardada(clave), JSON.stringify({ datos, guardadoEn: pedidoEn })).catch(() => {});
      return { datos, guardadoEn: null };
    } catch (error) {
      if (!esErrorDeRed(error)) throw error;
    }
  }

  const guardado = await AsyncStorage.getItem(claveGuardada(clave)).catch(() => null);
  if (!guardado) throw new SinConexionError();
  return JSON.parse(guardado) as ConCache<T>;
}

/**
 * Algo cambió en la API: lo que está en memoria se vuelve a pedir la próxima vez.
 * Sin `prefijos` se invalida todo. Las copias sin conexión se conservan.
 */
export function invalidarCache(prefijos?: string[]) {
  for (const clave of [...memoria.keys()]) {
    if (!prefijos || prefijos.some((p) => clave.startsWith(p))) memoria.delete(clave);
  }
  oyentes.forEach((oyente) => oyente());
}

const oyentes = new Set<() => void>();

/** Avisa cada vez que algo cambió en la API (p. ej. para recalcular los recordatorios). */
export function alInvalidarCache(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Al cerrar sesión: los datos guardados son de esa cuenta. */
export async function borrarCache() {
  memoria.clear();
  const claves = (await AsyncStorage.getAllKeys()).filter((clave) => clave.startsWith(PREFIJO));
  await AsyncStorage.multiRemove(claves);
}

/** "hace 5 min", "hace 2 h", "hace 3 días" */
export function hace(momento: number) {
  const minutos = Math.max(0, Math.round((Date.now() - momento) / 60000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

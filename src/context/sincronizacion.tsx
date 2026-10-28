import { useNetInfo } from '@react-native-community/netinfo';
import { isAxiosError } from 'axios';
import * as Crypto from 'expo-crypto';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { adjuntosApi, mensajeDeError, movimientosApi, programacionesApi } from '@/lib/api';
import { borrarArchivo, guardarArchivos, guardarCola, leerCola, type EnCola, type Operacion } from '@/lib/cola';
import { esErrorDeRed, hayConexion } from '@/lib/offline';
import type { ArchivoLocal } from '@/lib/types';

interface SincronizacionValue {
  /** Lo registrado sin conexión que aún no llega a la API. */
  cola: EnCola[];
  enLinea: boolean;
  sincronizando: boolean;
  /** Aumenta al enviar algo de la cola o al volver la conexión: las pantallas lo usan para recargar. */
  version: number;
  /** Guarda para enviar después. `id` es el cliente_id ya usado en el intento fallido. */
  encolar: (id: string, operacion: Operacion, archivos: ArchivoLocal[], vista: EnCola['vista']) => Promise<void>;
  sincronizar: () => Promise<void>;
  reintentar: (id: string) => Promise<void>;
  descartar: (id: string) => Promise<void>;
  /** Al cerrar sesión. */
  vaciar: () => Promise<void>;
}

const SincronizacionContext = createContext<SincronizacionValue | null>(null);

export function useSincronizacion() {
  const value = use(SincronizacionContext);
  if (!value) throw new Error('useSincronizacion debe usarse dentro de <SincronizacionProvider />');
  return value;
}

/** Id para lo que se crea en la app (cliente_id): reenviarlo no duplica en la API. */
export const nuevoClienteId = () => Crypto.randomUUID();

type Resultado = 'ok' | 'sin-red' | 'error';
type Cambio = (cola: EnCola[]) => EnCola[];

/**
 * Envía un elemento: crea el movimiento o pago (si falta) y sube sus comprobantes
 * a la vez. `alCrear` avisa apenas existe en la API, para que las pantallas lo muestren.
 */
async function enviar(
  elemento: EnCola,
  actualizar: (cambio: Cambio) => Promise<void>,
  alCrear: () => void,
): Promise<Resultado> {
  const cambiar = (cambio: (e: EnCola) => Partial<EnCola>) =>
    actualizar((cola) => cola.map((e) => (e.id === elemento.id ? { ...e, ...cambio(e) } : e)));

  try {
    let movimientoId = elemento.movimientoId;
    if (movimientoId === null) {
      const { operacion } = elemento;
      const movimiento =
        operacion.tipo === 'movimiento'
          ? await movimientosApi.crear({ ...operacion.datos, cliente_id: elemento.id })
          : await programacionesApi.pagar(operacion.programacionId, { ...operacion.datos, cliente_id: elemento.id });
      const id = movimiento.id;
      movimientoId = id;
      await cambiar(() => ({ movimientoId: id }));
      alCrear();
    }

    // Cada comprobante sale de la cola apenas sube (si uno falla, los demás no se repiten).
    const id = movimientoId;
    await Promise.all(
      elemento.archivos.map(async (archivo) => {
        await adjuntosApi.subir(id, archivo);
        borrarArchivo(archivo);
        await cambiar((e) => ({ archivos: e.archivos.filter((a) => a.uri !== archivo.uri) }));
      }),
    );

    await actualizar((cola) => cola.filter((e) => e.id !== elemento.id));
    return 'ok';
  } catch (error) {
    // Sin red (o sesión vencida): se reintenta todo más tarde.
    if (esErrorDeRed(error) || (isAxiosError(error) && error.response?.status === 401)) return 'sin-red';

    await cambiar(() => ({
      error: isAxiosError(error)
        ? mensajeDeError(error)
        : 'No se pudo leer un comprobante guardado. Descártalo o vuelve a registrarlo.',
    }));
    return 'error';
  }
}

export function SincronizacionProvider({ children }: PropsWithChildren) {
  const red = useNetInfo();
  const enLinea = red.isConnected !== false && red.isInternetReachable !== false;
  const [cola, setCola] = useState<EnCola[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [version, setVersion] = useState(0);
  // La cola "real" (la que se guarda); el estado es su copia para pintar.
  const colaRef = useRef<EnCola[]>([]);
  const ocupado = useRef(false);

  const actualizar = useCallback(async (cambio: Cambio) => {
    colaRef.current = cambio(colaRef.current);
    setCola(colaRef.current);
    await guardarCola(colaRef.current);
  }, []);

  const sincronizar = useCallback(async () => {
    if (ocupado.current || !hayConexion()) return;
    ocupado.current = true;
    setSincronizando(true);
    let enviados = 0;
    const intentados = new Set<string>();
    const recargar = () => setVersion((v) => v + 1);
    try {
      // En orden; la cola se vuelve a leer tras cada envío, así que lo que se
      // registre mientras tanto sale en esta misma vuelta. Si se cae la red, se
      // detiene y espera la próxima conexión.
      for (;;) {
        const siguiente = colaRef.current.find((e) => !e.error && !intentados.has(e.id));
        if (!siguiente) break;
        intentados.add(siguiente.id);
        const resultado = await enviar(siguiente, actualizar, recargar);
        if (resultado === 'sin-red') break;
        if (resultado === 'ok') enviados++;
      }
    } finally {
      ocupado.current = false;
      setSincronizando(false);
      // Ya con los comprobantes: que se vea su cantidad.
      if (enviados > 0) recargar();
    }
  }, [actualizar]);

  // Al abrir la app: cargar la cola guardada e intentar enviarla.
  useEffect(() => {
    leerCola().then((guardada) => {
      colaRef.current = guardada;
      setCola(guardada);
      sincronizar();
    });
  }, [sincronizar]);

  // Al volver la conexión (con un respiro para que la red se estabilice): enviar
  // la cola y que las pantallas que muestran datos guardados se recarguen.
  const estuvoSinRed = useRef(false);
  useEffect(() => {
    if (!enLinea) {
      estuvoSinRed.current = true;
      return;
    }
    const espera = setTimeout(() => {
      sincronizar().then(() => {
        if (!estuvoSinRed.current) return;
        estuvoSinRed.current = false;
        setVersion((v) => v + 1);
      });
    }, 1500);
    return () => clearTimeout(espera);
  }, [enLinea, sincronizar]);

  // Al volver a la app desde segundo plano.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizar();
    });
    return () => suscripcion.remove();
  }, [sincronizar]);

  const encolar = useCallback<SincronizacionValue['encolar']>(
    async (id, operacion, archivos, vista) => {
      const copias = await guardarArchivos(id, archivos);
      await actualizar((actual) => [
        ...actual,
        { id, operacion, archivos: copias, movimientoId: null, creado: Date.now(), error: null, vista },
      ]);
      // Con internet se envía ya, en segundo plano (quien encola no espera).
      void sincronizar();
    },
    [actualizar, sincronizar],
  );

  const reintentar = useCallback(
    async (id: string) => {
      await actualizar((actual) => actual.map((e) => (e.id === id ? { ...e, error: null } : e)));
      await sincronizar();
    },
    [actualizar, sincronizar],
  );

  const descartar = useCallback(
    async (id: string) => {
      colaRef.current.find((e) => e.id === id)?.archivos.forEach(borrarArchivo);
      await actualizar((actual) => actual.filter((e) => e.id !== id));
    },
    [actualizar],
  );

  const vaciar = useCallback(async () => {
    colaRef.current.forEach((e) => e.archivos.forEach(borrarArchivo));
    await actualizar(() => []);
  }, [actualizar]);

  return (
    <SincronizacionContext
      value={{ cola, enLinea, sincronizando, version, encolar, sincronizar, reintentar, descartar, vaciar }}
    >
      {children}
    </SincronizacionContext>
  );
}

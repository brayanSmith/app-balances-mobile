import { useNetInfo } from '@react-native-community/netinfo';
import { isAxiosError } from 'axios';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/context/auth';
import { useEstilos, useTema } from '@/context/tema';
import {
  guardarAdjuntosPendientes,
  leerAdjuntosPendientes,
  type AdjuntosPendientes,
} from '@/lib/adjuntosPendientes';
import { adjuntosApi, api, authApi, mensajeDeError } from '@/lib/api';
import { borrarArchivo, guardarArchivos, guardarCola, leerCola } from '@/lib/cola';
import { abrirBase, alCambiar, base, borrarBase } from '@/lib/db';
import { adjuntosDb, borrarAdjuntosLocales } from '@/lib/db/adjuntos';
import { completarPasoALocal, pasarALocal, pasarANube, pasoALocalPendiente } from '@/lib/db/modo';
import { guardarEstado, leerEstado, pendientesDeEnviar, sincronizarBase, yaSincronizada } from '@/lib/db/sync';
import { esErrorDeRed, hayConexion, invalidarCache } from '@/lib/offline';
import { radio, type Paleta } from '@/lib/theme';
import type { Almacenamiento, ArchivoLocal } from '@/lib/types';

/*
 * La app lee y escribe en la base del teléfono (lib/db). Este proveedor la abre al
 * entrar y, según el almacenamiento de la cuenta (lo elige el administrador):
 *
 * - nube: la mantiene al día con la API (al abrir la app, al volver la conexión, al
 *   volver a la app, cada pocos minutos y poco después de cada cambio) y sube los
 *   comprobantes, que viven en la API.
 * - local: no sincroniza; los comprobantes se guardan en el teléfono. Solo revisa de
 *   vez en cuando si el administrador cambió el almacenamiento.
 *
 * Al cambiar de nube a local se baja todo (también los comprobantes) y se borra del
 * servidor; de local a nube, se vuelve a subir todo.
 */

interface SincronizacionValue {
  modo: Almacenamiento;
  enLinea: boolean;
  sincronizando: boolean;
  /** Cambios guardados en el teléfono que aún no llegan a la API (con los comprobantes). */
  porEnviar: number;
  /** Lo que falló en la última sincronización (sin contar la falta de red). */
  error: string | null;
  /** Aumenta cuando la sincronización trae o envía algo (el análisis, que viene de la API, recarga). */
  version: number;
  sincronizar: () => Promise<void>;
  /** Guarda los comprobantes: en local, en el teléfono; en la nube, los sube cuando el movimiento ya esté en la API. */
  subirAdjuntos: (movimientoId: string, archivos: ArchivoLocal[]) => Promise<void>;
  /** Tras restablecer la cuenta: borra la base del teléfono y la vuelve a preparar. */
  reiniciar: () => Promise<void>;
}

const SincronizacionContext = createContext<SincronizacionValue | null>(null);

export function useSincronizacion() {
  const value = use(SincronizacionContext);
  if (!value) throw new Error('useSincronizacion debe usarse dentro de <SincronizacionProvider />');
  return value;
}

const CADA = 5 * 60 * 1000; // también se baja lo de otros dispositivos cada 5 minutos
const ESPERA_CAMBIO = 1500; // agrupa varios cambios seguidos en un solo envío

/**
 * Lo que quedó en la cola de versiones anteriores de la app (antes de la base local):
 * se envía una vez con los endpoints de siempre y la sincronización lo trae de vuelta.
 */
async function enviarColaAntigua() {
  let restante = await leerCola();
  for (const elemento of [...restante]) {
    try {
      let id = elemento.movimientoId;
      if (id === null) {
        const { operacion } = elemento;
        const { data } = await api.post<{ data: { id: number } }>(
          operacion.tipo === 'movimiento' ? '/movimientos' : `/programaciones/${operacion.programacionId}/pagar`,
          { ...operacion.datos, cliente_id: elemento.id },
        );
        id = data.data.id;
      }
      for (const archivo of elemento.archivos) {
        await adjuntosApi.subir(id, archivo);
        borrarArchivo(archivo);
      }
    } catch (error) {
      if (esErrorDeRed(error)) return; // se reintenta en la próxima sincronización
      // La API lo rechazó: ya no hay pantalla para corregirlo.
      elemento.archivos.forEach(borrarArchivo);
    }
    restante = restante.filter((e) => e.id !== elemento.id);
    await guardarCola(restante);
  }
}

export function SincronizacionProvider({ children }: PropsWithChildren) {
  const { user, actualizarUsuario } = useSession();
  // Solo se monta dentro de (app), es decir, con sesión.
  const usuario = user!.id;
  const modo: Almacenamiento = user!.almacenamiento ?? 'nube';
  const red = useNetInfo();
  const enLinea = red.isConnected !== false && red.isInternetReachable !== false;

  // null: la base está lista. Si no, se muestra la pantalla de carga (o el error).
  const [preparando, setPreparando] = useState<{ error: string | null; mensaje?: string } | null>({ error: null });
  const [sincronizando, setSincronizando] = useState(false);
  const [porEnviar, setPorEnviar] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const adjuntos = useRef<AdjuntosPendientes[]>([]);
  const lista = preparando === null;

  const contar = useCallback(async () => {
    if (modo === 'local') {
      setPorEnviar(0);
      return;
    }
    const archivos = adjuntos.current.reduce((n, a) => n + a.archivos.length, 0);
    setPorEnviar((await pendientesDeEnviar()) + archivos);
  }, [modo]);

  const guardarAdjuntos = useCallback(
    async (cambio: (lista: AdjuntosPendientes[]) => AdjuntosPendientes[]) => {
      adjuntos.current = cambio(adjuntos.current).filter((a) => a.archivos.length > 0);
      await guardarAdjuntosPendientes(usuario, adjuntos.current);
    },
    [usuario],
  );

  /** Sube los comprobantes pendientes. Devuelve si subió alguno. */
  const subirPendientes = useCallback(async () => {
    let subio = false;
    for (const pendiente of [...adjuntos.current]) {
      const quitar = (archivo: ArchivoLocal) =>
        guardarAdjuntos((lista) =>
          lista.map((a) =>
            a.movimientoId === pendiente.movimientoId ? { ...a, archivos: a.archivos.filter((x) => x !== archivo) } : a,
          ),
        );

      for (const archivo of pendiente.archivos) {
        try {
          await adjuntosApi.subir(pendiente.movimientoId, archivo);
          subio = true;
        } catch (e) {
          if (esErrorDeRed(e)) throw e;
          if (isAxiosError(e) && e.response?.status === 404) {
            // El movimiento no está en la API: si aquí sigue existiendo, todavía no se envía (se espera);
            // si se borró, el comprobante ya no tiene a dónde ir.
            const existe = await base().getFirstAsync('SELECT 1 FROM movimientos WHERE id = ?', pendiente.movimientoId);
            if (existe) break;
          } else {
            setError(`No se pudo subir ${archivo.nombre}: ${mensajeDeError(e)}`);
          }
        }
        borrarArchivo(archivo);
        await quitar(archivo);
      }
    }
    return subio;
  }, [guardarAdjuntos]);

  /** Si el administrador cambió el almacenamiento, el nuevo usuario hace que todo se vuelva a preparar. */
  const revisarCuenta = useCallback(async () => {
    try {
      const actual = await authApi.user();
      if ((actual.almacenamiento ?? 'nube') !== modo) await actualizarUsuario(actual);
    } catch {
      // Sin red o servidor caído: se revisa en la próxima ocasión.
    }
  }, [modo, actualizarUsuario]);

  const ocupado = useRef(false);
  const otraVez = useRef(false);

  const sincronizar = useCallback(async () => {
    if (!hayConexion()) return;
    // Si ya hay una en curso, al terminar se hace otra (para no subir un comprobante dos veces).
    if (ocupado.current) {
      otraVez.current = true;
      return;
    }
    ocupado.current = true;
    setSincronizando(true);
    try {
      do {
        otraVez.current = false;
        if (modo === 'local') {
          // Solo falta algo si quedó a medias el paso de la nube al teléfono.
          if (await pasoALocalPendiente()) await completarPasoALocal();
          setError(null);
          break;
        }
        await enviarColaAntigua();
        let cambio = await sincronizarBase();
        // Con comprobantes nuevos se baja otra vez para traer su cantidad.
        if (await subirPendientes()) cambio = (await sincronizarBase()) || true;
        if (cambio) {
          invalidarCache(['analisis:']);
          setVersion((v) => v + 1);
        }
        setError(null);
      } while (otraVez.current);
    } catch (e) {
      // 403: el administrador la pasó a "solo en el teléfono" y la app aún no se enteró.
      if (isAxiosError(e) && e.response?.status === 403) void revisarCuenta();
      else if (!esErrorDeRed(e)) setError(mensajeDeError(e));
    } finally {
      ocupado.current = false;
      setSincronizando(false);
      await contar().catch(() => {});
    }
  }, [modo, contar, subirPendientes, revisarCuenta]);

  /** De la nube al teléfono (ver lib/db/modo). */
  const irALocal = useCallback(
    async (nuncaSeUso: boolean) => {
      await pasarALocal(nuncaSeUso, adjuntos.current);
      await guardarAdjuntos(() => []);
      try {
        await completarPasoALocal();
      } catch (e) {
        // Sin internet se sigue en local y se completa después; un teléfono nuevo sí necesita los datos.
        if (nuncaSeUso || !esErrorDeRed(e)) throw e;
      }
    },
    [guardarAdjuntos],
  );

  /** Del teléfono a la nube: los comprobantes locales pasan a la cola de subida. */
  const irANube = useCallback(async () => {
    const locales = await pasarANube();
    await guardarAdjuntos((lista) => [...lista, ...locales]);
  }, [guardarAdjuntos]);

  /** Abre la base y la deja lista para el almacenamiento de la cuenta. */
  const preparar = useCallback(async () => {
    try {
      await abrirBase(usuario);
      adjuntos.current = await leerAdjuntosPendientes(usuario);
      const modoBase = await leerEstado('modo');

      if (modo === 'local' && modoBase !== 'local') {
        setPreparando({ error: null, mensaje: 'Pasando tus datos a este teléfono…' });
        await irALocal(modoBase === null && !(await yaSincronizada()));
      } else if (modo === 'nube' && modoBase === 'local') {
        setPreparando({ error: null, mensaje: 'Preparando tus datos para la nube…' });
        await irANube();
      } else if (modo === 'nube') {
        // Primera vez en este teléfono: se baja todo antes de mostrar la app.
        if (!(await yaSincronizada())) {
          await enviarColaAntigua();
          await sincronizarBase();
        }
        await guardarEstado('modo', 'nube');
      }

      setPreparando(null);
      await contar();
      void sincronizar();
    } catch (e) {
      setPreparando({
        error: esErrorDeRed(e)
          ? 'Necesitas internet la primera vez para descargar tus datos a este teléfono.'
          : mensajeDeError(e),
      });
    }
  }, [usuario, modo, irALocal, irANube, contar, sincronizar]);

  // Al entrar, al cambiar de cuenta o de almacenamiento. preparar solo cambia el estado después de abrir la base.
  useEffect(() => {
    void Promise.resolve().then(preparar);
  }, [preparar]);

  // Poco después de cada cambio local se envía (los avisos que da la propia sincronización no tienen nada pendiente).
  useEffect(() => {
    if (!lista || modo === 'local') return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const dejarDeOir = alCambiar(() => {
      clearTimeout(espera);
      espera = setTimeout(async () => {
        await contar().catch(() => {});
        if ((await pendientesDeEnviar().catch(() => 0)) > 0) void sincronizar();
      }, ESPERA_CAMBIO);
    });
    return () => {
      clearTimeout(espera);
      dejarDeOir();
    };
  }, [lista, modo, contar, sincronizar]);

  // Al volver la conexión (con un respiro para que la red se estabilice).
  useEffect(() => {
    if (!lista || !enLinea) return;
    const espera = setTimeout(() => {
      void revisarCuenta();
      void sincronizar();
    }, 1500);
    return () => clearTimeout(espera);
  }, [lista, enLinea, revisarCuenta, sincronizar]);

  // Al volver a la app y, mientras está abierta, cada pocos minutos.
  useEffect(() => {
    if (!lista) return;
    const alDia = () => {
      void revisarCuenta();
      void sincronizar();
    };
    const app = AppState.addEventListener('change', (estado) => estado === 'active' && alDia());
    const intervalo = setInterval(() => AppState.currentState === 'active' && alDia(), CADA);
    return () => {
      app.remove();
      clearInterval(intervalo);
    };
  }, [lista, revisarCuenta, sincronizar]);

  const subirAdjuntos = useCallback<SincronizacionValue['subirAdjuntos']>(
    async (movimientoId, archivos) => {
      if (archivos.length === 0) return;
      if (modo === 'local') {
        await adjuntosDb.agregar(movimientoId, archivos);
        return;
      }
      const copias = await guardarArchivos(movimientoId, archivos);
      await guardarAdjuntos((lista) => [...lista, { movimientoId, archivos: copias }]);
      await contar();
      void sincronizar();
    },
    [modo, guardarAdjuntos, contar, sincronizar],
  );

  const reiniciar = useCallback(async () => {
    setPreparando({ error: null });
    adjuntos.current.forEach((a) => a.archivos.forEach(borrarArchivo));
    await guardarAdjuntos(() => []);
    await borrarBase(usuario);
    borrarAdjuntosLocales(usuario);
    await preparar();
  }, [usuario, guardarAdjuntos, preparar]);

  const reintentarPreparar = () => {
    setPreparando({ error: null });
    void preparar();
  };

  if (preparando) {
    return <Preparando error={preparando.error} mensaje={preparando.mensaje} onReintentar={reintentarPreparar} />;
  }

  return (
    <SincronizacionContext
      value={{ modo, enLinea, sincronizando, porEnviar, error, version, sincronizar, subirAdjuntos, reiniciar }}
    >
      {children}
    </SincronizacionContext>
  );
}

interface PreparandoProps {
  error: string | null;
  mensaje?: string;
  onReintentar: () => void;
}

/** Mientras se abre la base, se descargan los datos por primera vez o se cambia de almacenamiento. */
function Preparando({ error, mensaje = 'Preparando tus datos…', onReintentar }: PreparandoProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.contenedor}>
      {error ? (
        <>
          <Text style={styles.titulo}>No se pudieron cargar tus datos</Text>
          <Text style={styles.texto}>{error}</Text>
          <Pressable onPress={onReintentar} style={styles.boton}>
            <Text style={styles.botonTexto}>Reintentar</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colores.primario} />
          <Text style={styles.texto}>{mensaje}</Text>
        </>
      )}
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    contenedor: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: 32,
      backgroundColor: colores.fondo,
    },
    titulo: { fontSize: 18, fontWeight: '700', color: colores.texto, textAlign: 'center' },
    texto: { fontSize: 14, color: colores.textoSuave, textAlign: 'center' },
    boton: { backgroundColor: colores.primario, borderRadius: radio.md, paddingHorizontal: 20, paddingVertical: 12 },
    botonTexto: { color: '#fff', fontWeight: '700' },
  });

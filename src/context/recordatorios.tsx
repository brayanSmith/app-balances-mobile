import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, AppState, Linking } from 'react-native';

import { alCambiar } from '@/lib/db';
import { programacionesDb } from '@/lib/db/programaciones';
import {
  cancelarRecordatorios,
  estadoPermiso,
  pedirPermiso,
  programarRecordatorios,
  recordatoriosDisponibles,
} from '@/lib/recordatorios';

// El usuario puede apagarlos desde el menú aunque el sistema tenga el permiso.
const PREFERENCIA = 'recordatorios_activos';
const DIAS = 45; // se agenda lo que vence en los próximos 45 días

interface RecordatoriosValue {
  /** false en web. */
  disponibles: boolean;
  activos: boolean;
  /** Encender pide el permiso del sistema (o lleva a Ajustes si se negó antes). */
  cambiar: (activar: boolean) => Promise<void>;
}

const RecordatoriosContext = createContext<RecordatoriosValue | null>(null);

export function useRecordatorios() {
  const value = use(RecordatoriosContext);
  if (!value) throw new Error('useRecordatorios debe usarse dentro de <RecordatoriosProvider />');
  return value;
}

/**
 * Mantiene agendadas las notificaciones de los pagos por vencer. La primera vez
 * que hay algo programado pide el permiso; luego se recalculan al abrir la app,
 * al volver a ella y cada vez que cambia algo.
 */
export function RecordatoriosProvider({ children }: PropsWithChildren) {
  const [activos, setActivos] = useState(recordatoriosDisponibles);
  const activosRef = useRef(activos);
  const ocupado = useRef(false);

  const actualizar = useCallback(async () => {
    if (!recordatoriosDisponibles || !activosRef.current || ocupado.current) return;
    ocupado.current = true;
    try {
      const pendientes = await programacionesDb.pendientes({ dias: DIAS });
      let permiso = await estadoPermiso();
      // Se pregunta solo cuando hay algo que recordar, no apenas se abre la app.
      if (permiso === 'preguntar' && pendientes.length > 0) {
        permiso = (await pedirPermiso()) ? 'concedido' : 'denegado';
      }
      if (permiso === 'concedido') await programarRecordatorios(pendientes);
    } catch {
      // Se reintenta en la próxima ocasión.
    } finally {
      ocupado.current = false;
    }
  }, []);

  // Al abrir: leer la preferencia y agendar.
  useEffect(() => {
    if (!recordatoriosDisponibles) return;
    AsyncStorage.getItem(PREFERENCIA)
      .catch(() => null)
      .then((guardado) => {
        activosRef.current = guardado !== 'no';
        setActivos(activosRef.current);
        return actualizar();
      });
  }, [actualizar]);

  // Al volver a la app y cuando cambia algo (pagar, omitir, editar, importar…).
  useEffect(() => {
    if (!recordatoriosDisponibles) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const pronto = () => {
      clearTimeout(espera);
      espera = setTimeout(actualizar, 1000); // agrupa varios cambios seguidos
    };
    const app = AppState.addEventListener('change', (estado) => estado === 'active' && pronto());
    const dejarDeOir = alCambiar((tablas) => tablas.some((t) => t !== 'categorias') && pronto());
    return () => {
      clearTimeout(espera);
      app.remove();
      dejarDeOir();
    };
  }, [actualizar]);

  const cambiar = useCallback(
    async (activar: boolean) => {
      if (activar) {
        let permiso = await estadoPermiso();
        if (permiso === 'preguntar') permiso = (await pedirPermiso()) ? 'concedido' : 'denegado';
        if (permiso !== 'concedido') {
          // El sistema ya no vuelve a mostrar el diálogo: hay que activarlas en Ajustes.
          Alert.alert(
            'Notificaciones desactivadas',
            'Para recibir los recordatorios de pagos, permite las notificaciones de Balances en los ajustes del teléfono.',
            [
              { text: 'Ahora no', style: 'cancel' },
              { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }
      }
      activosRef.current = activar;
      setActivos(activar);
      await AsyncStorage.setItem(PREFERENCIA, activar ? 'si' : 'no').catch(() => {});
      if (activar) await actualizar();
      else await cancelarRecordatorios();
    },
    [actualizar],
  );

  return (
    <RecordatoriosContext value={{ disponibles: recordatoriosDisponibles, activos, cambiar }}>
      {children}
    </RecordatoriosContext>
  );
}

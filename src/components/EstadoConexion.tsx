import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { hace } from '@/lib/offline';
import { radio, type Paleta } from '@/lib/theme';

interface Props {
  /** Solo para datos que vienen de la API (análisis): cuándo se guardó la copia que se muestra. */
  guardadoEn?: number | null;
  /** Volver a pedir esos datos a la API. */
  onReintentar?: () => void;
}

/**
 * Aviso de "sin conexión", de lo que falta por enviar y de si la sincronización
 * falló. No se muestra nada si hay conexión y todo está enviado.
 */
export function EstadoConexion({ guardadoEn = null, onReintentar }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { modo, enLinea, sincronizando, porEnviar, error, sincronizar } = useSincronizacion();

  const sinServidor = !enLinea || guardadoEn !== null;

  // Una cuenta que guarda solo en el teléfono no depende de la conexión.
  if (modo === 'local' || (!sinServidor && porEnviar === 0 && !error)) return null;

  return (
    <View style={[styles.caja, sinServidor ? styles.cajaSinRed : styles.cajaCola]}>
      {sinServidor && (
        <View style={styles.fila}>
          <Ionicons name="cloud-offline-outline" size={20} color={colores.aviso} />
          <Text style={styles.texto}>
            <Text style={styles.fuerte}>{enLinea ? 'Sin conexión con el servidor' : 'Sin conexión'}</Text>
            {guardadoEn !== null ? ` · mostrando datos de ${hace(guardadoEn)}` : ' · lo que registres se guarda en el teléfono'}
          </Text>
          {onReintentar && guardadoEn !== null && (
            <Pressable onPress={onReintentar} hitSlop={8} style={[styles.boton, styles.botonAviso]}>
              <Text style={styles.botonTexto}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      )}

      {porEnviar > 0 && (
        <View style={styles.fila}>
          <Ionicons name="cloud-upload-outline" size={20} color={colores.primario} />
          <Text style={styles.texto}>
            <Text style={styles.fuerte}>
              {porEnviar} {porEnviar === 1 ? 'cambio por enviar' : 'cambios por enviar'}
            </Text>
            {enLinea ? '' : ' · se enviarán solos cuando vuelva internet'}
          </Text>
          {enLinea &&
            (sincronizando ? (
              <ActivityIndicator color={colores.primario} />
            ) : (
              <Pressable onPress={sincronizar} hitSlop={8} style={styles.boton}>
                <Text style={styles.botonTexto}>Enviar ahora</Text>
              </Pressable>
            ))}
        </View>
      )}

      {error && enLinea && (
        <View style={styles.fila}>
          <Ionicons name="alert-circle" size={20} color={colores.gasto} />
          <Text style={[styles.texto, { color: colores.gasto }]}>No se pudo sincronizar: {error}</Text>
          {!sincronizando && (
            <Pressable onPress={sincronizar} hitSlop={8} style={[styles.boton, styles.botonError]}>
              <Text style={styles.botonTexto}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    caja: { borderRadius: radio.md, padding: 12, gap: 10, borderWidth: 1 },
    cajaSinRed: { backgroundColor: colores.avisoSuave, borderColor: colores.aviso },
    cajaCola: { backgroundColor: colores.primarioSuave, borderColor: colores.primario },
    fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    texto: { flex: 1, fontSize: 13, color: colores.texto },
    fuerte: { fontWeight: '700' },
    boton: { backgroundColor: colores.primario, borderRadius: radio.sm, paddingHorizontal: 10, paddingVertical: 6 },
    botonAviso: { backgroundColor: colores.aviso },
    botonError: { backgroundColor: colores.gasto },
    botonTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },
  });

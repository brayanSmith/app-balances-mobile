import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoriaIcono } from '@/components/CategoriaIcono';
import { useEstilos, useTema } from '@/context/tema';
import { etiquetaDia, formatearMonto } from '@/lib/format';
import { radio, type Paleta } from '@/lib/theme';
import type { Movimiento } from '@/lib/types';

/** Agrupa por día para un SectionList (los movimientos ya vienen del más reciente al más antiguo). */
export function agruparPorDia(movimientos: Movimiento[]) {
  const porDia = new Map<string, Movimiento[]>();
  for (const m of movimientos) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);
  return [...porDia].map(([fecha, data]) => ({ titulo: etiquetaDia(fecha), data }));
}

export function EncabezadoDia({ titulo }: { titulo: string }) {
  const styles = useEstilos(crearEstilos);
  return <Text style={styles.dia}>{titulo}</Text>;
}

export function FilaMovimiento({ movimiento, onPress }: { movimiento: Movimiento; onPress: () => void }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const esIngreso = movimiento.tipo === 'ingreso';

  return (
    <Pressable style={({ pressed }) => [styles.fila, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <CategoriaIcono categoria={movimiento.categoria} />
      <View style={{ flex: 1 }}>
        <Text style={styles.descripcion} numberOfLines={1}>
          {movimiento.descripcion}
        </Text>
        <View style={styles.detalleFila}>
          <Text style={styles.detalle}>{movimiento.categoria?.nombre ?? 'Sin categoría'}</Text>
          {movimiento.local && (
            <View style={[styles.etiqueta, movimiento.local.error ? styles.etiquetaError : styles.etiquetaLocal]}>
              <Ionicons
                name={movimiento.local.error ? 'alert-circle' : 'cloud-upload-outline'}
                size={12}
                color={movimiento.local.error ? colores.gasto : colores.aviso}
              />
              <Text style={[styles.etiquetaTexto, { color: movimiento.local.error ? colores.gasto : colores.aviso }]}>
                {movimiento.local.error ? 'No se envió' : 'Sin enviar'}
              </Text>
            </View>
          )}
          {movimiento.programado && (
            <View style={styles.etiqueta}>
              <Ionicons name="repeat" size={11} color={colores.primario} />
              <Text style={styles.etiquetaTexto}>Programado</Text>
            </View>
          )}
          {movimiento.adjuntos_count > 0 && (
            <View style={styles.etiqueta}>
              <Ionicons name="attach" size={12} color={colores.primario} />
              <Text style={styles.etiquetaTexto}>{movimiento.adjuntos_count}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.monto, { color: esIngreso ? colores.ingreso : colores.gasto }]}>
        {esIngreso ? '+' : '−'}
        {formatearMonto(movimiento.monto)}
      </Text>
    </Pressable>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    dia: {
      fontSize: 13,
      fontWeight: '700',
      color: colores.textoSuave,
      marginTop: 16,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      boxShadow: colores.sombra,
    },
    descripcion: { fontSize: 16, color: colores.texto, fontWeight: '600' },
    detalleFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    detalle: { fontSize: 13, color: colores.textoSuave },
    etiqueta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colores.primarioSuave,
      borderRadius: radio.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    etiquetaTexto: { fontSize: 11, fontWeight: '600', color: colores.primario },
    etiquetaLocal: { backgroundColor: colores.avisoSuave },
    etiquetaError: { backgroundColor: colores.gastoSuave },
    monto: { fontSize: 16, fontWeight: '700' },
  });

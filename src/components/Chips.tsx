import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useEstilos, useTema } from '@/context/tema';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';

export interface OpcionChip<T extends string> {
  valor: T;
  texto: string;
  icono?: NombreIcono;
}

interface Props<T extends string> {
  opciones: OpcionChip<T>[];
  valor: T;
  onChange: (valor: T) => void;
}

/** Fila de "píldoras" con scroll horizontal (períodos, meses…). */
export function Chips<T extends string>({ opciones, valor, onChange }: Props<T>) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <Pressable key={o.valor} onPress={() => onChange(o.valor)} style={[styles.chip, activo && styles.chipActivo]}>
            {o.icono && <Ionicons name={o.icono} size={14} color={activo ? '#fff' : colores.texto} />}
            <Text style={[styles.texto, activo && styles.textoActivo]}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    fila: { gap: 8, paddingRight: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radio.sm,
      backgroundColor: colores.tarjeta,
      borderWidth: 1,
      borderColor: colores.borde,
    },
    chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
    texto: { color: colores.texto, fontWeight: '500' },
    textoActivo: { color: '#fff', fontWeight: '700' },
  });

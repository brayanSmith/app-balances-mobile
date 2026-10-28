import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useEstilos, useTema } from '@/context/tema';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';

export interface OpcionSegmentado<T extends string> {
  valor: T;
  texto: string;
  icono?: NombreIcono;
  color?: string;
}

interface Props<T extends string> {
  opciones: OpcionSegmentado<T>[];
  valor: T;
  onChange: (valor: T) => void;
}

/** Selector tipo "píldora" (p. ej. Gasto / Ingreso). */
export function Segmentado<T extends string>({ opciones, valor, onChange }: Props<T>) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.contenedor}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        const color = activo ? (o.color ?? colores.primario) : colores.textoSuave;
        return (
          <Pressable
            key={o.valor}
            style={[styles.opcion, activo && styles.activo]}
            onPress={() => onChange(o.valor)}
          >
            {o.icono && <Ionicons name={o.icono} size={18} color={color} />}
            <Text style={[styles.texto, { color }]}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    contenedor: { flexDirection: 'row', backgroundColor: colores.superficie, borderRadius: radio.md, padding: 4 },
    opcion: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: radio.sm,
    },
    activo: { backgroundColor: colores.tarjeta, boxShadow: colores.sombra },
    texto: { fontSize: 15, fontWeight: '600' },
  });

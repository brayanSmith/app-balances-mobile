import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { degradado, radio } from '@/lib/theme';

interface Props {
  texto: string;
  onPress: () => void;
  cargando?: boolean;
  /** Se ve atenuado y no responde (p. ej. falta completar un campo). */
  deshabilitado?: boolean;
  /** Color sólido en lugar del degradado de la marca (p. ej. verde para ingresos). */
  color?: string;
}

/** Botón principal de ancho completo. */
export function Boton({ texto, onPress, cargando = false, deshabilitado = false, color }: Props) {
  const colores = color ? ([color, color] as const) : degradado;

  return (
    <Pressable
      onPress={onPress}
      disabled={cargando || deshabilitado}
      style={({ pressed }) => [styles.contenedor, pressed && { opacity: 0.85 }, deshabilitado && { opacity: 0.45 }]}
    >
      <LinearGradient colors={colores} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.boton}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.texto}>{texto}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contenedor: { borderRadius: radio.md, overflow: 'hidden' },
  boton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 54 },
  texto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

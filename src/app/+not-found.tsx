import { Ionicons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useEstilos, useTema } from '@/context/tema';
import { radio, type Paleta } from '@/lib/theme';

/** Reemplaza la pantalla "Unmatched Route" (en inglés) de Expo Router. */
export default function NoEncontrada() {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.contenedor}>
      <Stack.Screen options={{ title: 'No encontrada' }} />
      <Ionicons name="compass-outline" size={56} color={colores.textoSuave} />
      <Text style={styles.titulo}>Esta pantalla no existe</Text>
      <Text style={styles.texto}>Puede que el enlace esté mal escrito o que la página ya no esté disponible.</Text>
      <Link href="/" style={styles.boton}>
        Ir al inicio
      </Link>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    contenedor: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 24,
      backgroundColor: colores.fondo,
    },
    titulo: { fontSize: 20, fontWeight: '800', color: colores.texto, textAlign: 'center' },
    texto: { fontSize: 15, color: colores.textoSuave, textAlign: 'center', maxWidth: 320 },
    boton: {
      marginTop: 8,
      backgroundColor: colores.primario,
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: radio.md,
      overflow: 'hidden',
    },
  });

import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { User } from '@/lib/types';

interface Props {
  user: User | null;
  tamano: number;
  /** Fondo y color de la inicial cuando no hay foto (o no cargó). */
  fondo: string;
  colorTexto: string;
  style?: StyleProp<ViewStyle>;
}

/** Foto de perfil redonda; si no hay (o no carga, p. ej. sin conexión), la inicial del nombre. */
export function Avatar({ user, tamano, fondo, colorTexto, style }: Props) {
  // La URL con la que falló: con una foto nueva se vuelve a intentar.
  const [fallo, setFallo] = useState<string | null>(null);
  const url = user?.foto_url ?? null;
  const inicial = user?.name.trim().charAt(0).toUpperCase() || '?';
  const redondo = { width: tamano, height: tamano, borderRadius: tamano / 2 };

  return (
    <View style={[styles.base, redondo, { backgroundColor: fondo }, style]}>
      {url && fallo !== url ? (
        <Image source={{ uri: url }} style={redondo} onError={() => setFallo(url)} accessibilityLabel="Foto de perfil" />
      ) : (
        <Text style={{ color: colorTexto, fontSize: tamano * 0.44, fontWeight: '800' }}>{inicial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { conAlpha, type NombreIcono } from '@/lib/theme';

const SIN_CATEGORIA = { icono: 'help-circle', color: '#94A3B8' };

interface Props {
  categoria?: { icono: string; color: string } | null;
  tamano?: number;
  /** Fondo del color de la categoría con el ícono en blanco (seleccionado). */
  solido?: boolean;
}

/** Círculo con el ícono y el color de una categoría. */
export function CategoriaIcono({ categoria, tamano = 42, solido = false }: Props) {
  const { icono, color } = categoria ?? SIN_CATEGORIA;

  return (
    <View
      style={{
        width: tamano,
        height: tamano,
        borderRadius: tamano / 2,
        backgroundColor: solido ? color : conAlpha(color, 0.15),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icono as NombreIcono} size={tamano * 0.5} color={solido ? '#fff' : color} />
    </View>
  );
}

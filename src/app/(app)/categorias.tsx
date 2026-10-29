import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Boton } from '@/components/Boton';
import { CategoriaIcono } from '@/components/CategoriaIcono';
import { CategoriaSheet } from '@/components/CategoriaSheet';
import { Segmentado } from '@/components/Segmentado';
import { useCategorias } from '@/context/categorias';
import { useEstilos, useTema } from '@/context/tema';
import { type Paleta, radio } from '@/lib/theme';
import type { Categoria, TipoMovimiento } from '@/lib/types';

interface EstadoSheet {
  abierto: boolean;
  categoria: Categoria | null;
  clave: number;
}

export default function CategoriasScreen() {
  const insets = useSafeAreaInsets();
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { categorias } = useCategorias();
  const [tipo, setTipo] = useState<TipoMovimiento>('gasto');
  const [sheet, setSheet] = useState<EstadoSheet>({ abierto: false, categoria: null, clave: 0 });

  const abrir = (categoria: Categoria | null) =>
    setSheet((s) => ({ abierto: true, categoria, clave: s.clave + 1 }));
  const cerrar = () => setSheet((s) => ({ ...s, abierto: false }));
  // La lista se actualiza sola (lee de la base local).
  const alTerminar = cerrar;

  return (
    <View style={styles.container}>
      <FlatList
        data={categorias.filter((c) => c.tipo === tipo)}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 110 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 6 }}>
            <Segmentado
              opciones={[
                { valor: 'gasto', texto: 'Gastos', color: colores.gasto },
                { valor: 'ingreso', texto: 'Ingresos', color: colores.ingreso },
              ]}
              valor={tipo}
              onChange={setTipo}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.fila, pressed && { opacity: 0.7 }]} onPress={() => abrir(item)}>
            <CategoriaIcono categoria={item} />
            <Text style={styles.nombre}>{item.nombre}</Text>
            <Ionicons name="chevron-forward" size={18} color={colores.textoSuave} />
          </Pressable>
        )}
      />

      <View style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}>
        <Boton texto="Nueva categoría" onPress={() => abrir(null)} />
      </View>

      <CategoriaSheet
        key={`categoria-${sheet.clave}`}
        visible={sheet.abierto}
        categoria={sheet.categoria}
        tipoInicial={tipo}
        onClose={cerrar}
        onGuardada={alTerminar}
        onEliminada={alTerminar}
      />
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colores.fondo },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      padding: 14,
      boxShadow: colores.sombra,
    },
    nombre: { flex: 1, fontSize: 16, fontWeight: '600', color: colores.texto },
    pie: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  });

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { CategoriaIcono } from '@/components/CategoriaIcono';
import { Segmentado } from '@/components/Segmentado';
import { categoriasApi, mensajeDeError } from '@/lib/api';
import { useEstilos, useTema } from '@/context/tema';
import { conAlpha, ICONOS, PALETA, type Paleta, radio } from '@/lib/theme';
import type { Categoria, TipoMovimiento } from '@/lib/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Categoría a editar; sin ella se crea una nueva. */
  categoria?: Categoria | null;
  tipoInicial?: TipoMovimiento;
  onGuardada: (categoria: Categoria) => void;
  onEliminada?: () => void;
}

/** Crear o editar una categoría: nombre, ícono y color. */
export function CategoriaSheet({ visible, onClose, categoria, tipoInicial = 'gasto', onGuardada, onEliminada }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [tipo, setTipo] = useState<TipoMovimiento>(categoria?.tipo ?? tipoInicial);
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [icono, setIcono] = useState(categoria?.icono ?? ICONOS[0]);
  const [color, setColor] = useState(categoria?.color ?? PALETA[6]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setGuardando(true);
    const input = { tipo, nombre: nombre.trim(), icono, color };
    try {
      const guardada = categoria
        ? await categoriasApi.actualizar(categoria.id, input)
        : await categoriasApi.crear(input);
      onGuardada(guardada);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!categoria) return;
    try {
      await categoriasApi.eliminar(categoria.id);
      onEliminada?.();
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  function confirmarEliminar() {
    const mensaje = 'Los movimientos de esta categoría se conservan, pero quedan sin categoría.';
    // Alert con botones no funciona en web.
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar la categoría? ${mensaje}`)) eliminar();
      return;
    }
    Alert.alert('Eliminar categoría', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: eliminar },
    ]);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo={categoria ? 'Editar categoría' : 'Nueva categoría'}
      pie={
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          <Boton texto="Guardar categoría" onPress={guardar} cargando={guardando} />
          {categoria && (
            <Pressable onPress={confirmarEliminar} style={styles.eliminar}>
              <Ionicons name="trash-outline" size={18} color={colores.gasto} />
              <Text style={styles.eliminarTexto}>Eliminar categoría</Text>
            </Pressable>
          )}
        </>
      }
    >
      {!categoria && (
        <Segmentado
          opciones={[
            { valor: 'gasto', texto: 'Gasto', color: colores.gasto },
            { valor: 'ingreso', texto: 'Ingreso', color: colores.ingreso },
          ]}
          valor={tipo}
          onChange={setTipo}
        />
      )}

      <View style={styles.vistaPrevia}>
        <CategoriaIcono categoria={{ icono, color }} tamano={72} solido />
        <TextInput
          style={styles.nombre}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Nombre de la categoría"
          placeholderTextColor={colores.textoSuave}
          maxLength={50}
        />
      </View>

      <View>
        <Text style={styles.label}>Color</Text>
        <View style={styles.grilla}>
          {PALETA.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.color, { backgroundColor: c }, color === c && { borderColor: conAlpha(c, 0.35) }]}
            >
              {color === c && <Ionicons name="checkmark" size={18} color="#fff" />}
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text style={styles.label}>Ícono</Text>
        <View style={styles.grilla}>
          {ICONOS.map((i) => {
            const activo = icono === i;
            return (
              <Pressable
                key={i}
                onPress={() => setIcono(i)}
                style={[styles.icono, activo && { backgroundColor: conAlpha(color, 0.15), borderColor: color }]}
              >
                <Ionicons name={i} size={22} color={activo ? color : colores.textoSuave} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    vistaPrevia: { alignItems: 'center', gap: 12 },
    nombre: {
      alignSelf: 'stretch',
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '600',
      color: colores.texto,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colores.borde,
    },
    label: { fontSize: 14, fontWeight: '600', color: colores.textoSuave, marginBottom: 10 },
    grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    color: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 4,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    icono: {
      width: 46,
      height: 46,
      borderRadius: radio.md,
      borderWidth: 1.5,
      borderColor: colores.borde,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: colores.gasto, textAlign: 'center' },
    eliminar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
    eliminarTexto: { color: colores.gasto, fontWeight: '600' },
  });

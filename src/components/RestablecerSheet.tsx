import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { useEstilos, useTema } from '@/context/tema';
import { cuentaApi, mensajeDeError } from '@/lib/api';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';

const PALABRA = 'BORRAR';

const SE_BORRA: { icono: NombreIcono; texto: string }[] = [
  { icono: 'swap-vertical', texto: 'Todos los ingresos y gastos, con su historial' },
  { icono: 'attach', texto: 'Los comprobantes adjuntos (fotos y PDF)' },
  { icono: 'repeat', texto: 'Los movimientos programados' },
  { icono: 'cloud-upload', texto: 'El registro de importaciones' },
  { icono: 'pricetags', texto: 'Tus categorías (vuelven las predeterminadas)' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onRestablecido: () => void;
}

/** Confirmación para dejar la cuenta "de fábrica". */
export function RestablecerSheet({ visible, onClose, onRestablecido }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [confirmacion, setConfirmacion] = useState('');
  const [password, setPassword] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = confirmacion.trim() === PALABRA && password !== '';

  async function restablecer() {
    setError(null);
    setBorrando(true);
    try {
      await cuentaApi.restablecer(password, confirmacion.trim());
      onRestablecido();
    } catch (e) {
      setError(mensajeDeError(e));
      setBorrando(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo="Restablecer datos"
      pie={
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          <Boton
            texto="Borrar todo"
            onPress={restablecer}
            cargando={borrando}
            deshabilitado={!listo}
            color={colores.gasto}
          />
        </>
      }
    >
      <View style={styles.alerta}>
        <View style={styles.alertaIcono}>
          <Ionicons name="warning" size={30} color="#fff" />
        </View>
        <Text style={styles.alertaTitulo}>Esta acción no se puede deshacer</Text>
        <Text style={styles.alertaTexto}>
          Tu cuenta quedará como recién creada. Si compartes la cuenta con otras personas, también se borra lo que
          ellas registraron.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={styles.label}>Se eliminará:</Text>
        {SE_BORRA.map(({ icono, texto }) => (
          <View key={texto} style={styles.item}>
            <Ionicons name={icono} size={18} color={colores.gasto} />
            <Text style={styles.itemTexto}>{texto}</Text>
          </View>
        ))}
        <View style={styles.item}>
          <Ionicons name="shield-checkmark" size={18} color={colores.ingreso} />
          <Text style={styles.itemTexto}>Se conserva tu usuario: seguirás con la sesión iniciada.</Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>
          Escribe <Text style={styles.palabra}>{PALABRA}</Text> para confirmar
        </Text>
        <TextInput
          style={[styles.input, confirmacion.trim() === PALABRA && { borderColor: colores.gasto }]}
          value={confirmacion}
          onChangeText={setConfirmacion}
          placeholder={PALABRA}
          placeholderTextColor={colores.textoSuave}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>Tu contraseña</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Contraseña"
          placeholderTextColor={colores.textoSuave}
          secureTextEntry
        />
      </View>
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    alerta: {
      alignItems: 'center',
      gap: 8,
      backgroundColor: colores.gastoSuave,
      borderRadius: radio.lg,
      padding: 18,
    },
    alertaIcono: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colores.gasto,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertaTitulo: { fontSize: 17, fontWeight: '800', color: colores.gasto, textAlign: 'center' },
    alertaTexto: { fontSize: 14, color: colores.texto, textAlign: 'center' },
    label: { fontSize: 14, fontWeight: '600', color: colores.texto },
    palabra: { fontWeight: '800', color: colores.gasto, letterSpacing: 1 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    itemTexto: { flex: 1, fontSize: 14, color: colores.texto },
    input: {
      backgroundColor: colores.superficie,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radio.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colores.texto,
    },
    error: { color: colores.gasto, textAlign: 'center' },
  });

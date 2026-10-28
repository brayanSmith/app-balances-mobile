import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { useSession } from '@/context/auth';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError } from '@/lib/api';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';

const PALABRA = 'ELIMINAR';

const SE_BORRA: { icono: NombreIcono; texto: string }[] = [
  { icono: 'person', texto: 'Tu cuenta: ya no podrás entrar con ella' },
  { icono: 'swap-vertical', texto: 'Todos tus ingresos y gastos, con su historial' },
  { icono: 'repeat', texto: 'Tus pagos e ingresos programados' },
  { icono: 'attach', texto: 'Los comprobantes adjuntos (fotos y PDF) y tu foto de perfil' },
  { icono: 'pricetags', texto: 'Tus categorías e importaciones' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Elimina la cuenta y todos sus datos (lo exige Google Play). Al terminar se sale al login. */
export function EliminarCuentaSheet({ visible, onClose }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { user, eliminarCuenta } = useSession();
  const { vaciar } = useSincronizacion();
  const [confirmacion, setConfirmacion] = useState('');
  const [password, setPassword] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quien entró con Google y no creó contraseña solo escribe ELIMINAR.
  const pidePassword = user?.tiene_password !== false;
  const listo = confirmacion.trim() === PALABRA && (!pidePassword || password !== '');

  async function eliminar() {
    setError(null);
    setEliminando(true);
    try {
      await eliminarCuenta(confirmacion.trim(), pidePassword ? password : null);
      // Lo que quedó en el teléfono sin enviar ya no tiene a dónde ir.
      await vaciar().catch(() => {});
      // Al cerrarse la sesión la app vuelve sola al login.
    } catch (e) {
      setError(mensajeDeError(e));
      setEliminando(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo="Eliminar cuenta"
      pie={
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          <Boton
            texto="Eliminar mi cuenta"
            onPress={eliminar}
            cargando={eliminando}
            deshabilitado={!listo}
            color={colores.gasto}
          />
        </>
      }
    >
      <View style={styles.alerta}>
        <View style={styles.alertaIcono}>
          <Ionicons name="trash" size={28} color="#fff" />
        </View>
        <Text style={styles.alertaTitulo}>Esto no se puede deshacer</Text>
        <Text style={styles.alertaTexto}>
          Si solo quieres empezar de cero y conservar tu cuenta, usa «Restablecer datos» en el menú.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={styles.label}>Se eliminará para siempre:</Text>
        {SE_BORRA.map(({ icono, texto }) => (
          <View key={texto} style={styles.item}>
            <Ionicons name={icono} size={18} color={colores.gasto} />
            <Text style={styles.itemTexto}>{texto}</Text>
          </View>
        ))}
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

      {pidePassword && (
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
      )}
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    alerta: { alignItems: 'center', gap: 8, backgroundColor: colores.gastoSuave, borderRadius: radio.lg, padding: 18 },
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

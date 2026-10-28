import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { useSession } from '@/context/auth';
import { useEstilos, useTema } from '@/context/tema';
import { authApi, mensajeDeError } from '@/lib/api';
import { radio, type Paleta } from '@/lib/theme';

const ESPERA_REENVIO = 60; // segundos, igual que en la API

interface Props {
  visible: boolean;
  onClose: () => void;
  /** El correo que ya se escribió en el login, para no pedirlo otra vez. */
  emailInicial: string;
}

/**
 * "¿Olvidaste tu contraseña?" en dos pasos: el correo y luego el código que llega
 * ahí junto con la contraseña nueva. Al terminar queda la sesión iniciada.
 */
export function RecuperarSheet({ visible, onClose, emailInicial }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { restablecerPassword } = useSession();
  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo');
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [abierta, setAbierta] = useState(visible);

  // Cada vez que se abre empieza de cero, con el correo del login.
  if (visible !== abierta) {
    setAbierta(visible);
    if (visible) {
      setPaso('correo');
      setEmail(emailInicial);
      setCodigo('');
      setPassword('');
      setError(null);
    }
  }

  // Cuenta regresiva para "Reenviar código".
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function pedirCodigo() {
    setError(null);
    setEnviando(true);
    try {
      await authApi.pedirCodigo(email.trim());
      setPaso('codigo');
      setEspera(ESPERA_REENVIO);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function cambiar() {
    setError(null);
    setEnviando(true);
    try {
      // Al iniciar sesión se sale del login y esta hoja desaparece sola.
      await restablecerPassword(email.trim(), codigo, password);
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  }

  const enCodigo = paso === 'codigo';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo="Recuperar contraseña"
      pie={
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          {enCodigo ? (
            <Boton
              texto="Cambiar contraseña"
              onPress={cambiar}
              cargando={enviando}
              deshabilitado={codigo.length !== 6 || password.length < 8}
            />
          ) : (
            <Boton texto="Enviar código" onPress={pedirCodigo} cargando={enviando} deshabilitado={!email.trim()} />
          )}
        </>
      }
    >
      {enCodigo ? (
        <>
          <Text style={styles.texto}>
            Si <Text style={styles.fuerte}>{email.trim()}</Text> tiene una cuenta, te llegó un código de 6 dígitos.
            Vence en 15 minutos; revisa también la carpeta de spam.
          </Text>

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Código</Text>
            <TextInput
              style={[styles.input, styles.codigo]}
              value={codigo}
              onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colores.textoSuave}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Contraseña nueva</Text>
            <View style={[styles.input, styles.fila]}>
              <TextInput
                style={styles.inputInterno}
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={colores.textoSuave}
                secureTextEntry={!verPassword}
                autoComplete="new-password"
              />
              <Pressable onPress={() => setVerPassword((v) => !v)} hitSlop={10}>
                <Ionicons name={verPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
              </Pressable>
            </View>
          </View>

          <View style={styles.acciones}>
            <Pressable onPress={pedirCodigo} disabled={espera > 0 || enviando} hitSlop={8}>
              <Text style={[styles.link, espera > 0 && styles.linkInactivo]}>
                {espera > 0 ? `Reenviar código en ${espera}s` : 'Reenviar código'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPaso('correo');
                setError(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.link}>Cambiar correo</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.texto}>
            Escribe el correo de tu cuenta y te enviaremos un código para elegir una contraseña nueva.
          </Text>
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tucorreo@ejemplo.com"
              placeholderTextColor={colores.textoSuave}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    texto: { fontSize: 15, color: colores.textoSuave, lineHeight: 21 },
    fuerte: { fontWeight: '700', color: colores.texto },
    label: { fontSize: 14, fontWeight: '600', color: colores.texto },
    input: {
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colores.texto,
    },
    codigo: { fontSize: 26, fontWeight: '700', letterSpacing: 10, textAlign: 'center' },
    fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0 },
    inputInterno: { flex: 1, fontSize: 16, color: colores.texto, paddingVertical: 12 },
    acciones: { flexDirection: 'row', justifyContent: 'space-between' },
    link: { color: colores.primario, fontWeight: '700', fontSize: 14 },
    linkInactivo: { color: colores.textoSuave, fontWeight: '500' },
    error: { color: colores.gasto, textAlign: 'center' },
  });

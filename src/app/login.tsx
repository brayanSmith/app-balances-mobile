import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Boton } from '@/components/Boton';
import { RecuperarSheet } from '@/components/RecuperarSheet';
import { useSession } from '@/context/auth';
import { mensajeDeError } from '@/lib/api';
import { googleDisponible } from '@/lib/google';
import { useEstilos, useTema } from '@/context/tema';
import { degradado, type NombreIcono, type Paleta, radio } from '@/lib/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colores, esOscuro, setPreferencia } = useTema();
  const styles = useEstilos(crearEstilos);
  const { signIn, signUp, signInConGoogle } = useSession();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [conGoogle, setConGoogle] = useState(false);

  const esRegistro = modo === 'registro';

  async function enviar() {
    setError(null);
    setEnviando(true);
    try {
      if (esRegistro) await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  }

  // Sirve igual para entrar o registrarse: si la cuenta no existe, la API la crea.
  async function entrarConGoogle() {
    setError(null);
    setConGoogle(true);
    try {
      await signInConGoogle();
    } catch (e) {
      // Los errores del selector de Google ya vienen en español; los de la API, por mensajeDeError.
      setError(e instanceof Error && !isAxiosError(e) ? e.message : mensajeDeError(e));
    } finally {
      setConGoogle(false);
    }
  }

  return (
    <LinearGradient colors={degradado} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Pressable
        onPress={() => setPreferencia(esOscuro ? 'claro' : 'oscuro')}
        hitSlop={10}
        style={[styles.tema, { top: insets.top + 12 }]}
        accessibilityLabel={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        <Ionicons name={esOscuro ? 'sunny-outline' : 'moon-outline'} size={20} color="#fff" />
      </Pressable>
      {/* También en Android: con edge-to-edge el sistema ya no achica la pantalla al abrir el teclado. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.marca, { paddingTop: insets.top + 48 }]}>
            <View style={styles.logo}>
              <Ionicons name="wallet" size={38} color={colores.primario} />
            </View>
            <Text style={styles.titulo}>Balances</Text>
            <Text style={styles.lema}>Tus ingresos y gastos, claros y bajo control.</Text>
          </View>

          <View style={[styles.card, { paddingBottom: insets.bottom + 28 }]}>
            <Text style={styles.cardTitulo}>{esRegistro ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</Text>

            {esRegistro && <Campo icono="person-outline" placeholder="Nombre" value={name} onChangeText={setName} />}
            <Campo
              icono="mail-outline"
              placeholder="Correo"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Campo
              icono="lock-closed-outline"
              placeholder="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!verPassword}
              accesorio={
                <Pressable onPress={() => setVerPassword((v) => !v)} hitSlop={10}>
                  <Ionicons name={verPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
                </Pressable>
              }
            />

            {!esRegistro && (
              <Pressable onPress={() => setRecuperando(true)} hitSlop={8} style={styles.olvido}>
                <Text style={styles.linkFuerte}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Boton texto={esRegistro ? 'Registrarme' : 'Entrar'} onPress={enviar} cargando={enviando} />

            {googleDisponible && (
              <>
                <View style={styles.separador}>
                  <View style={styles.linea} />
                  <Text style={styles.separadorTexto}>o</Text>
                  <View style={styles.linea} />
                </View>
                <Pressable
                  onPress={entrarConGoogle}
                  disabled={conGoogle || enviando}
                  style={({ pressed }) => [styles.google, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  {conGoogle ? (
                    <ActivityIndicator color={colores.texto} />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={20} color="#4285F4" />
                      <Text style={styles.googleTexto}>Continuar con Google</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => {
                setModo(esRegistro ? 'login' : 'registro');
                setError(null);
              }}
            >
              <Text style={styles.link}>
                {esRegistro ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
                <Text style={styles.linkFuerte}>{esRegistro ? 'Inicia sesión' : 'Regístrate'}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <RecuperarSheet visible={recuperando} onClose={() => setRecuperando(false)} emailInicial={email.trim()} />
    </LinearGradient>
  );
}

type CampoProps = React.ComponentProps<typeof TextInput> & {
  icono: NombreIcono;
  accesorio?: React.ReactNode;
};

function Campo({ icono, accesorio, ...props }: CampoProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.campo}>
      <Ionicons name={icono} size={20} color={colores.textoSuave} />
      <TextInput style={styles.campoInput} placeholderTextColor={colores.textoSuave} {...props} />
      {accesorio}
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    scroll: { flexGrow: 1, justifyContent: 'space-between' },
    tema: {
      position: 'absolute',
      right: 16,
      zIndex: 1,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    marca: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 36 },
    logo: {
      width: 76,
      height: 76,
      borderRadius: radio.lg,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      boxShadow: '0px 10px 24px rgba(6, 78, 59, 0.3)',
    },
    titulo: { fontSize: 32, fontWeight: '800', color: '#fff' },
    lema: { fontSize: 15, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 6 },
    card: {
      backgroundColor: colores.tarjeta,
      borderTopLeftRadius: radio.lg,
      borderTopRightRadius: radio.lg,
      padding: 24,
      gap: 14,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    cardTitulo: { fontSize: 22, fontWeight: '700', color: colores.texto, marginBottom: 4 },
    campo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      paddingHorizontal: 14,
    },
    campoInput: { flex: 1, fontSize: 16, color: colores.texto, paddingVertical: 14 },
    olvido: { alignSelf: 'flex-end', marginTop: -4 },
    error: { color: colores.gasto, fontSize: 14 },
    link: { color: colores.textoSuave, textAlign: 'center', marginTop: 4 },
    linkFuerte: { color: colores.primario, fontWeight: '700' },
    separador: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    linea: { flex: 1, height: 1, backgroundColor: colores.borde },
    separadorTexto: { color: colores.textoSuave, fontSize: 13 },
    google: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      minHeight: 54,
      borderRadius: radio.md,
      borderWidth: 1.5,
      borderColor: colores.borde,
      backgroundColor: colores.tarjeta,
    },
    googleTexto: { fontSize: 16, fontWeight: '600', color: colores.texto },
  });

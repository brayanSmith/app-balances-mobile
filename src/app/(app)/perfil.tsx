import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { Avatar } from '@/components/Avatar';
import { Boton } from '@/components/Boton';
import { EliminarCuentaSheet } from '@/components/EliminarCuentaSheet';
import { useSession } from '@/context/auth';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError, perfilApi } from '@/lib/api';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';

/** "Mi perfil": foto, nombre, correo, contraseña y eliminar la cuenta. */
export default function PerfilScreen() {
  const insets = useSafeAreaInsets();
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [eliminando, setEliminando] = useState(false);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Foto />
        <DondeSeGuarda />
        <DatosPersonales />
        <CambiarPassword />

        <Pressable
          onPress={() => setEliminando(true)}
          style={({ pressed }) => [styles.eliminar, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={colores.gasto} />
          <Text style={styles.eliminarTexto}>Eliminar cuenta</Text>
        </Pressable>
      </ScrollView>

      <EliminarCuentaSheet visible={eliminando} onClose={() => setEliminando(false)} />
    </KeyboardAvoidingView>
  );
}

function Foto() {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { user, actualizarUsuario } = useSession();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(accion: () => Promise<Parameters<typeof actualizarUsuario>[0]>) {
    setError(null);
    setSubiendo(true);
    try {
      await actualizarUsuario(await accion());
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function elegir(origen: 'camara' | 'galeria') {
    if (origen === 'camara') {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Sin permiso', 'Permite el acceso a la cámara para tomarte la foto.');
        return;
      }
    }
    // Recorte cuadrado: la foto se muestra en un círculo.
    const opciones: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    };
    const r =
      origen === 'camara'
        ? await ImagePicker.launchCameraAsync({ ...opciones, cameraType: ImagePicker.CameraType.front })
        : await ImagePicker.launchImageLibraryAsync(opciones);
    if (r.canceled) return;

    const a = r.assets[0];
    await guardar(() =>
      perfilApi.subirFoto({ uri: a.uri, nombre: a.fileName ?? 'perfil.jpg', mime: a.mimeType ?? 'image/jpeg', file: a.file }),
    );
  }

  function cambiar() {
    // En web no hay cámara ni Alert con botones: directo a elegir el archivo.
    if (Platform.OS === 'web') {
      elegir('galeria');
      return;
    }
    Alert.alert('Foto de perfil', undefined, [
      { text: 'Tomar foto', onPress: () => elegir('camara') },
      { text: 'Elegir de la galería', onPress: () => elegir('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.foto}>
      <Pressable onPress={cambiar} disabled={subiendo} accessibilityLabel="Cambiar foto de perfil">
        <Avatar user={user} tamano={104} fondo={colores.primarioSuave} colorTexto={colores.primario} />
        {subiendo ? (
          <View style={styles.fotoCargando}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View style={styles.fotoBoton}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        )}
      </Pressable>
      <Text style={styles.fotoNombre}>{user?.name}</Text>
      <View style={styles.fotoAcciones}>
        <Pressable onPress={cambiar} disabled={subiendo} hitSlop={8}>
          <Text style={styles.link}>{user?.foto_url ? 'Cambiar foto' : 'Agregar foto'}</Text>
        </Pressable>
        {user?.foto_url && (
          <Pressable onPress={() => guardar(perfilApi.quitarFoto)} disabled={subiendo} hitSlop={8}>
            <Text style={[styles.link, { color: colores.gasto }]}>Quitar</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function DatosPersonales() {
  const styles = useEstilos(crearEstilos);
  const { user, actualizarUsuario } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [passwordActual, setPasswordActual] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cambiaCorreo = email.trim() !== user?.email;
  const hayCambios = name.trim() !== user?.name || cambiaCorreo;
  // Entró con Google y aún no tiene contraseña: para cambiar el correo primero debe crearla.
  const sinPassword = user?.tiene_password === false;

  async function guardar() {
    setError(null);
    setListo(false);
    setGuardando(true);
    try {
      const actualizado = await perfilApi.actualizar({
        name: name.trim(),
        email: email.trim(),
        ...(cambiaCorreo && { password_actual: passwordActual }),
      });
      await actualizarUsuario(actualizado);
      setPasswordActual('');
      setListo(true);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion icono="person-outline" titulo="Datos personales">
      <Campo etiqueta="Nombre" value={name} onChangeText={setName} autoComplete="name" />
      <Campo
        etiqueta="Correo"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      {cambiaCorreo &&
        (sinPassword ? (
          <Text style={styles.error}>
            Entraste con Google: para cambiar el correo, primero crea una contraseña más abajo.
          </Text>
        ) : (
          <Campo
            etiqueta="Contraseña actual"
            ayuda="Para cambiar el correo con el que entras."
            value={passwordActual}
            onChangeText={setPasswordActual}
            secreto
          />
        ))}

      {error && <Text style={styles.error}>{error}</Text>}
      {listo && !hayCambios && <Exito texto="Datos guardados." />}
      <Boton
        texto="Guardar cambios"
        onPress={guardar}
        cargando={guardando}
        deshabilitado={
          !hayCambios || !name.trim() || !email.trim() || (cambiaCorreo && (sinPassword || !passwordActual))
        }
      />
    </Seccion>
  );
}

function CambiarPassword() {
  const styles = useEstilos(crearEstilos);
  const { user, actualizarUsuario } = useSession();
  // Entró con Google y aún no tiene contraseña: la crea, sin pedir una "actual".
  const crear = user?.tiene_password === false;
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const noCoinciden = confirmacion !== '' && nueva !== confirmacion;

  async function guardar() {
    setError(null);
    setListo(false);
    setGuardando(true);
    try {
      await perfilApi.cambiarPassword(crear ? null : actual, nueva, confirmacion);
      if (crear && user) await actualizarUsuario({ ...user, tiene_password: true });
      setActual('');
      setNueva('');
      setConfirmacion('');
      setListo(true);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion icono="lock-closed-outline" titulo={crear ? 'Crear contraseña' : 'Cambiar contraseña'}>
      {crear ? (
        <Text style={styles.ayuda}>
          Entraste con Google. Crea una contraseña si también quieres entrar con tu correo.
        </Text>
      ) : (
        <Campo etiqueta="Contraseña actual" value={actual} onChangeText={setActual} secreto />
      )}
      <Campo
        etiqueta="Contraseña nueva"
        ayuda="Mínimo 8 caracteres."
        value={nueva}
        onChangeText={setNueva}
        secreto
        autoComplete="new-password"
      />
      <Campo
        etiqueta="Repite la contraseña nueva"
        value={confirmacion}
        onChangeText={setConfirmacion}
        secreto
        autoComplete="new-password"
        invalido={noCoinciden}
      />

      {noCoinciden && <Text style={styles.error}>Las contraseñas no coinciden.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      {listo && <Exito texto="Contraseña guardada. Se cerró la sesión en tus otros dispositivos." />}
      <Boton
        texto={crear ? 'Crear contraseña' : 'Cambiar contraseña'}
        onPress={guardar}
        cargando={guardando}
        deshabilitado={(!crear && !actual) || nueva.length < 8 || nueva !== confirmacion}
      />
    </Seccion>
  );
}

/** Dónde quedan los datos de la cuenta (lo elige el administrador): que la persona sepa qué pierde si cambia de teléfono. */
function DondeSeGuarda() {
  const styles = useEstilos(crearEstilos);
  const { modo } = useSincronizacion();

  return modo === 'local' ? (
    <Seccion icono="phone-portrait-outline" titulo="Tus datos están solo en este teléfono">
      <Text style={styles.ayuda}>
        No se guardan en internet. Si desinstalas la app, borras sus datos o cambias de teléfono, se pierden. Si
        necesitas una copia en la nube, pídesela al administrador de Balances.
      </Text>
    </Seccion>
  ) : (
    <Seccion icono="cloud-done-outline" titulo="Tus datos están en la nube">
      <Text style={styles.ayuda}>
        Se guardan en este teléfono y se sincronizan con el servidor: los recuperas si cambias de teléfono.
      </Text>
    </Seccion>
  );
}

function Seccion({ icono, titulo, children }: { icono: NombreIcono; titulo: string; children: React.ReactNode }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.seccion}>
      <View style={styles.seccionTitulo}>
        <Ionicons name={icono} size={18} color={colores.primario} />
        <Text style={styles.seccionTexto}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

type CampoProps = React.ComponentProps<typeof TextInput> & {
  etiqueta: string;
  ayuda?: string;
  /** Contraseña: oculta, con el ojo para verla. */
  secreto?: boolean;
  invalido?: boolean;
};

function Campo({ etiqueta, ayuda, secreto = false, invalido = false, ...props }: CampoProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [ver, setVer] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{etiqueta}</Text>
      <View style={[styles.campo, invalido && { borderColor: colores.gasto }]}>
        <TextInput
          style={styles.campoInput}
          placeholderTextColor={colores.textoSuave}
          secureTextEntry={secreto && !ver}
          autoCapitalize={secreto ? 'none' : undefined}
          autoComplete={secreto ? 'current-password' : undefined}
          {...props}
        />
        {secreto && (
          <Pressable onPress={() => setVer((v) => !v)} hitSlop={10}>
            <Ionicons name={ver ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
          </Pressable>
        )}
      </View>
      {ayuda && <Text style={styles.ayuda}>{ayuda}</Text>}
    </View>
  );
}

function Exito({ texto }: { texto: string }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.exito}>
      <Ionicons name="checkmark-circle" size={18} color={colores.ingreso} />
      <Text style={styles.exitoTexto}>{texto}</Text>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    contenido: { padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
    foto: { alignItems: 'center', gap: 8, paddingVertical: 8 },
    fotoBoton: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colores.primario,
      borderWidth: 3,
      borderColor: colores.fondo,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fotoCargando: {
      ...StyleSheet.absoluteFill,
      borderRadius: 52,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fotoNombre: { fontSize: 20, fontWeight: '700', color: colores.texto, marginTop: 4 },
    fotoAcciones: { flexDirection: 'row', gap: 20 },
    link: { color: colores.primario, fontWeight: '700', fontSize: 14 },
    seccion: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      padding: 18,
      gap: 14,
      boxShadow: colores.sombra,
    },
    seccionTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    seccionTexto: { fontSize: 17, fontWeight: '700', color: colores.texto },
    label: { fontSize: 14, fontWeight: '600', color: colores.texto },
    campo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.superficie,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radio.md,
      paddingHorizontal: 14,
    },
    campoInput: { flex: 1, fontSize: 16, color: colores.texto, paddingVertical: 12 },
    ayuda: { fontSize: 12, color: colores.textoSuave },
    error: { color: colores.gasto, fontSize: 14 },
    exito: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colores.ingresoSuave,
      borderRadius: radio.md,
      padding: 10,
    },
    exitoTexto: { flex: 1, color: colores.texto, fontSize: 14 },
    eliminar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      marginTop: 8,
      borderRadius: radio.md,
      backgroundColor: colores.gastoSuave,
    },
    eliminarTexto: { color: colores.gasto, fontSize: 16, fontWeight: '700' },
  });

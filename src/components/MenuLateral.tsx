import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { useSession } from '@/context/auth';
import { useRecordatorios } from '@/context/recordatorios';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { degradado, type NombreIcono, type Paleta, radio } from '@/lib/theme';

const nativo = Platform.OS !== 'web';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Abre la confirmación para borrar todos los datos (vive fuera del menú). */
  onRestablecer: () => void;
}

/** Menú que entra desde la izquierda: navegación, modo oscuro y cerrar sesión. */
export function MenuLateral({ visible, onClose, onRestablecer }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colores, esOscuro, setPreferencia } = useTema();
  const styles = useEstilos(crearEstilos);
  const { user, signOut } = useSession();
  const { cola, vaciar } = useSincronizacion();
  const recordatorios = useRecordatorios();

  // Lo que está en cola sin enviar se pierde al cerrar sesión: se advierte antes.
  function cerrarSesion() {
    onClose();
    if (cola.length === 0) {
      signOut();
      return;
    }
    const mensaje = `Tienes ${cola.length} ${cola.length === 1 ? 'cambio' : 'cambios'} sin enviar por falta de conexión. Si cierras sesión se perderán.`;
    const salir = async () => {
      await vaciar();
      await signOut();
    };
    // Alert con botones no funciona en web.
    if (Platform.OS === 'web') {
      if (window.confirm(`${mensaje}

¿Cerrar sesión de todos modos?`)) salir();
      return;
    }
    Alert.alert('Cambios sin enviar', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: salir },
    ]);
  }

  const ancho = Math.min(300, width * 0.82);
  const [montado, setMontado] = useState(visible);
  const [progreso] = useState(() => new Animated.Value(0)); // 0 cerrado, 1 abierto
  const [arrastre] = useState(() => new Animated.Value(0)); // px arrastrados hacia la izquierda

  // Se monta al abrir y se desmonta cuando termina la animación de cierre.
  if (visible && !montado) setMontado(true);

  useEffect(() => {
    if (visible) {
      arrastre.setValue(0);
      Animated.timing(progreso, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: nativo,
      }).start();
    } else {
      Animated.timing(progreso, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: nativo,
      }).start(({ finished }) => finished && setMontado(false));
    }
  }, [visible, progreso, arrastre]);

  // Deslizar hacia la izquierda para cerrar.
  const gestos = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => arrastre.setValue(Math.min(0, g.dx)),
        onPanResponderRelease: (_, g) => {
          if (g.dx < -80 || g.vx < -1) onClose();
          else Animated.spring(arrastre, { toValue: 0, useNativeDriver: nativo }).start();
        },
      }),
    [arrastre, onClose],
  );

  const translateX = Animated.add(
    progreso.interpolate({ inputRange: [0, 1], outputRange: [-ancho, 0] }),
    arrastre,
  );

  const ir = (ruta: Href) => {
    onClose();
    router.push(ruta);
  };

  return (
    <Modal visible={montado} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fondo, { opacity: progreso }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar menú" />
      </Animated.View>

      <Animated.View
        {...gestos.panHandlers}
        style={[styles.panel, { width: ancho, paddingBottom: insets.bottom + 16, transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={degradado}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.perfil, { paddingTop: insets.top + 24 }]}
        >
          <Pressable onPress={() => ir('/perfil')} accessibilityLabel="Ver mi perfil">
            <Avatar
              user={user}
              tamano={58}
              fondo="rgba(255,255,255,0.25)"
              colorTexto="#fff"
              style={styles.avatar}
            />
            <Text style={styles.nombre} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={styles.correo} numberOfLines={1}>
              {user?.email}
            </Text>
          </Pressable>
        </LinearGradient>

        <View style={styles.opciones}>
          <Opcion icono="home-outline" texto="Inicio" onPress={onClose} />
          <Opcion icono="time-outline" texto="Historial" onPress={() => ir('/historial')} />
          <Opcion icono="analytics-outline" texto="Análisis" onPress={() => ir('/analisis')} />
          <Opcion icono="pricetags-outline" texto="Categorías" onPress={() => ir('/categorias')} />
          <Opcion icono="cloud-upload-outline" texto="Importar CSV" onPress={() => ir('/importar')} />
          <Opcion icono="person-circle-outline" texto="Mi perfil" onPress={() => ir('/perfil')} />

          <View style={styles.separador} />

          <View style={styles.opcion}>
            <View style={styles.opcionIcono}>
              <Ionicons name={esOscuro ? 'moon' : 'moon-outline'} size={20} color={colores.primario} />
            </View>
            <Text style={styles.opcionTexto}>Modo oscuro</Text>
            <Switch
              value={esOscuro}
              onValueChange={(oscuro) => setPreferencia(oscuro ? 'oscuro' : 'claro')}
              trackColor={{ true: colores.primario, false: colores.borde }}
              thumbColor="#fff"
            />
          </View>

          {recordatorios.disponibles && (
            <View style={styles.opcion}>
              <View style={styles.opcionIcono}>
                <Ionicons
                  name={recordatorios.activos ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color={colores.primario}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.opcionTexto}>Recordatorios</Text>
                <Text style={styles.opcionDetalle}>Pagos por vencer</Text>
              </View>
              <Switch
                value={recordatorios.activos}
                onValueChange={recordatorios.cambiar}
                trackColor={{ true: colores.primario, false: colores.borde }}
                thumbColor="#fff"
              />
            </View>
          )}

          <View style={styles.separador} />

          <Opcion
            icono="refresh-circle-outline"
            texto="Restablecer datos"
            peligro
            onPress={() => {
              onClose();
              onRestablecer();
            }}
          />
        </View>

        <Pressable
          onPress={cerrarSesion}
          style={({ pressed }) => [styles.salir, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="log-out-outline" size={20} color={colores.gasto} />
          <Text style={styles.salirTexto}>Cerrar sesión</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

interface OpcionProps {
  icono: NombreIcono;
  texto: string;
  onPress: () => void;
  /** En rojo: acciones destructivas. */
  peligro?: boolean;
}

function Opcion({ icono, texto, onPress, peligro = false }: OpcionProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const color = peligro ? colores.gasto : colores.primario;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.opcion, pressed && styles.opcionPresionada]}>
      <View style={[styles.opcionIcono, peligro && { backgroundColor: colores.gastoSuave }]}>
        <Ionicons name={icono} size={20} color={color} />
      </View>
      <Text style={[styles.opcionTexto, peligro && { color }]}>{texto}</Text>
      <Ionicons name="chevron-forward" size={18} color={colores.textoSuave} />
    </Pressable>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    fondo: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    panel: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colores.tarjeta,
      borderTopRightRadius: radio.lg,
      borderBottomRightRadius: radio.lg,
      overflow: 'hidden',
      boxShadow: '8px 0px 30px rgba(0, 0, 0, 0.2)',
    },
    perfil: { paddingHorizontal: 22, paddingBottom: 22 },
    avatar: { marginBottom: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
    nombre: { color: '#fff', fontSize: 18, fontWeight: '700' },
    correo: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
    opciones: { flex: 1, paddingHorizontal: 12, paddingTop: 16, gap: 4 },
    opcion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: radio.md,
    },
    opcionPresionada: { backgroundColor: colores.superficie },
    opcionIcono: {
      width: 38,
      height: 38,
      borderRadius: radio.md,
      backgroundColor: colores.primarioSuave,
      alignItems: 'center',
      justifyContent: 'center',
    },
    opcionTexto: { flex: 1, fontSize: 16, fontWeight: '600', color: colores.texto },
    opcionDetalle: { fontSize: 12, color: colores.textoSuave, marginTop: 1 },
    separador: { height: 1, backgroundColor: colores.borde, marginVertical: 10, marginHorizontal: 10 },
    salir: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      paddingVertical: 14,
      borderRadius: radio.md,
      backgroundColor: colores.gastoSuave,
    },
    salirTexto: { color: colores.gasto, fontSize: 16, fontWeight: '700' },
  });

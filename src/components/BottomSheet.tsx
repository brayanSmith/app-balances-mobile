import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEstilos, useTema } from '@/context/tema';
import { radio, type Paleta } from '@/lib/theme';

const nativo = Platform.OS !== 'web';

interface Props {
  visible: boolean;
  onClose: () => void;
  titulo?: string;
  /** Contenido fijo al final (p. ej. el botón Guardar), fuera del scroll. */
  pie?: ReactNode;
  children: ReactNode;
}

/**
 * Hoja que sube desde abajo con las esquinas superiores redondeadas.
 * Se cierra tocando el fondo, con la X o arrastrándola hacia abajo.
 */
export function BottomSheet({ visible, onClose, titulo, pie, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [montado, setMontado] = useState(visible);
  const [progreso] = useState(() => new Animated.Value(0)); // 0 cerrada, 1 abierta
  const [arrastre] = useState(() => new Animated.Value(0)); // px arrastrados hacia abajo

  // Se monta al abrir y se desmonta cuando termina la animación de cierre.
  if (visible && !montado) setMontado(true);

  useEffect(() => {
    if (visible) {
      arrastre.setValue(0);
      Animated.spring(progreso, {
        toValue: 1,
        damping: 22,
        stiffness: 210,
        mass: 0.9,
        useNativeDriver: nativo,
      }).start();
    } else {
      Animated.timing(progreso, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: nativo,
      }).start(({ finished }) => finished && setMontado(false));
    }
  }, [visible, progreso, arrastre]);

  const gestos = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => arrastre.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 120 || g.vy > 1.2) onClose();
          else Animated.spring(arrastre, { toValue: 0, useNativeDriver: nativo }).start();
        },
      }),
    [arrastre, onClose],
  );

  const translateY = Animated.add(
    progreso.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
    arrastre,
  );

  return (
    <Modal
      visible={montado}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.fondo, { opacity: progreso }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
      </Animated.View>

      {/* También en Android: con edge-to-edge el sistema ya no achica la pantalla al abrir el teclado. */}
      <KeyboardAvoidingView behavior={nativo ? 'padding' : undefined} style={styles.contenedor}>
        <Animated.View
          style={[
            styles.hoja,
            { maxHeight: height * 0.92, paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
          ]}
        >
          <View {...gestos.panHandlers} style={styles.cabecera}>
            <View style={styles.agarre} />
            {titulo && (
              <View style={styles.filaTitulo}>
                <Text style={styles.titulo}>{titulo}</Text>
                <Pressable onPress={onClose} hitSlop={10} style={styles.cerrar} accessibilityLabel="Cerrar">
                  <Ionicons name="close" size={20} color={colores.textoSuave} />
                </Pressable>
              </View>
            )}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.contenido}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {pie && <View style={styles.pie}>{pie}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    fondo: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    contenedor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'box-none' },
    hoja: {
      width: '100%',
      // Con el teclado abierto queda menos alto: la hoja se encoge y su contenido hace scroll.
      flexShrink: 1,
      maxWidth: 560,
      backgroundColor: colores.tarjeta,
      borderTopLeftRadius: radio.lg,
      borderTopRightRadius: radio.lg,
      boxShadow: '0px -8px 30px rgba(0, 0, 0, 0.18)',
    },
    cabecera: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 8 },
    agarre: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colores.borde },
    filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    titulo: { fontSize: 20, fontWeight: '700', color: colores.texto },
    cerrar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colores.superficie,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contenido: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 18 },
    pie: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  });

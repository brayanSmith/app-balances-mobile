import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { abrirAdjunto, compartirAdjunto } from '@/lib/compartir';
import { formatearTamano } from '@/lib/format';
import { radio, type NombreIcono } from '@/lib/theme';
import type { Adjunto } from '@/lib/types';

interface Props {
  adjuntos: Adjunto[];
  /** Comprobante que se muestra al abrir; null = cerrado. */
  indiceInicial: number | null;
  onClose: () => void;
}

/**
 * Visor a pantalla completa de los comprobantes de un movimiento: imagen grande
 * (con zoom en iOS) o ficha del PDF, con botones para compartir y abrir.
 */
export function VisorAdjuntos({ adjuntos, indiceInicial, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [indice, setIndice] = useState(indiceInicial ?? 0);
  const [ocupado, setOcupado] = useState<'compartir' | 'abrir' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adjunto = adjuntos[indice];
  if (indiceInicial === null || !adjunto) return null;

  async function accion(tipo: 'compartir' | 'abrir') {
    setError(null);
    setOcupado(tipo);
    try {
      await (tipo === 'compartir' ? compartirAdjunto(adjunto) : abrirAdjunto(adjunto));
    } catch (e) {
      setError(
        e instanceof Error && e.message.startsWith('Este dispositivo')
          ? e.message
          : `No se pudo ${tipo} el archivo. Revisa tu conexión e inténtalo de nuevo.`,
      );
    } finally {
      setOcupado(null);
    }
  }

  const mover = (delta: number) => {
    setError(null);
    setIndice((i) => (i + delta + adjuntos.length) % adjuntos.length);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.fondo, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.cabecera}>
          <BotonRedondo icono="close" onPress={onClose} etiqueta="Cerrar" />
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre} numberOfLines={1}>
              {adjunto.nombre}
            </Text>
            <Text style={styles.detalle}>
              {formatearTamano(adjunto.tamano)}
              {adjuntos.length > 1 ? `  ·  ${indice + 1} de ${adjuntos.length}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.contenido}>
          {adjunto.es_imagen ? (
            // En iOS el ScrollView permite pellizcar para hacer zoom.
            <ScrollView
              style={{ flex: 1, alignSelf: 'stretch' }}
              contentContainerStyle={{ flexGrow: 1 }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image source={{ uri: adjunto.url }} style={styles.imagen} resizeMode="contain" />
            </ScrollView>
          ) : (
            <View style={styles.documento}>
              <View style={styles.documentoIcono}>
                <Ionicons name="document-text" size={56} color="#fff" />
              </View>
              <Text style={styles.documentoNombre} numberOfLines={3}>
                {adjunto.nombre}
              </Text>
              <Text style={styles.detalle}>PDF · {formatearTamano(adjunto.tamano)}</Text>
            </View>
          )}

          {adjuntos.length > 1 && (
            <>
              <Pressable style={[styles.flecha, { left: 8 }]} onPress={() => mover(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color="#fff" />
              </Pressable>
              <Pressable style={[styles.flecha, { right: 8 }]} onPress={() => mover(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={26} color="#fff" />
              </Pressable>
            </>
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.acciones}>
          <BotonAccion
            icono="share-social-outline"
            texto="Compartir"
            cargando={ocupado === 'compartir'}
            onPress={() => accion('compartir')}
          />
          <BotonAccion
            icono="open-outline"
            texto={Platform.OS === 'android' && !adjunto.es_imagen ? 'Abrir con…' : 'Abrir'}
            cargando={ocupado === 'abrir'}
            onPress={() => accion('abrir')}
          />
        </View>
      </View>
    </Modal>
  );
}

function BotonRedondo({ icono, onPress, etiqueta }: { icono: NombreIcono; onPress: () => void; etiqueta: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.redondo} accessibilityLabel={etiqueta}>
      <Ionicons name={icono} size={22} color="#fff" />
    </Pressable>
  );
}

interface BotonAccionProps {
  icono: NombreIcono;
  texto: string;
  cargando: boolean;
  onPress: () => void;
}

function BotonAccion({ icono, texto, cargando, onPress }: BotonAccionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={cargando}
      style={({ pressed }) => [styles.accion, pressed && { opacity: 0.7 }]}
    >
      {cargando ? <ActivityIndicator color="#fff" /> : <Ionicons name={icono} size={20} color="#fff" />}
      <Text style={styles.accionTexto}>{texto}</Text>
    </Pressable>
  );
}

// Siempre oscuro (como la galería del celular), en modo claro y en modo oscuro.
const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.94)', paddingHorizontal: 16, gap: 12 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  redondo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombre: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detalle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  contenido: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imagen: { flex: 1, width: '100%', minHeight: 300 },
  documento: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  documentoIcono: {
    width: 110,
    height: 110,
    borderRadius: radio.lg,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentoNombre: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  flecha: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: '#FCA5A5', textAlign: 'center' },
  acciones: { flexDirection: 'row', gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  accion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radio.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  accionTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VisorAdjuntos } from '@/components/VisorAdjuntos';
import { useEstilos, useTema } from '@/context/tema';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';
import type { Adjunto, ArchivoLocal } from '@/lib/types';

interface Props {
  /** Ya guardados en la API (sin los marcados para eliminar). */
  existentes: Adjunto[];
  /** Elegidos en el dispositivo; se suben al guardar. */
  nuevos: ArchivoLocal[];
  onAgregar: (archivos: ArchivoLocal[]) => void;
  onQuitarNuevo: (archivo: ArchivoLocal) => void;
  onQuitarExistente: (adjunto: Adjunto) => void;
}

type ImagenElegida = ImagePicker.ImagePickerAsset;

const desdeImagen = (a: ImagenElegida, i: number): ArchivoLocal => ({
  uri: a.uri,
  nombre: a.fileName ?? `foto-${i + 1}.jpg`,
  mime: a.mimeType ?? 'image/jpeg',
  file: a.file,
});

/** Comprobantes del movimiento: tomar foto, elegir de la galería o adjuntar un PDF. */
export function Adjuntos({ existentes, nuevos, onAgregar, onQuitarNuevo, onQuitarExistente }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  // Comprobante abierto en el visor (índice en "existentes"), o null.
  const [visor, setVisor] = useState<number | null>(null);

  async function tomarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Sin permiso', 'Permite el acceso a la cámara para fotografiar el comprobante.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled) onAgregar(r.assets.map(desdeImagen));
  }

  async function elegirDeGaleria() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!r.canceled) onAgregar(r.assets.map(desdeImagen));
  }

  async function elegirArchivo() {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!r.canceled) {
      onAgregar(
        r.assets.map((a) => ({
          uri: a.uri,
          nombre: a.name,
          mime: a.mimeType ?? 'application/pdf',
          file: a.file,
        })),
      );
    }
  }

  const hayArchivos = existentes.length > 0 || nuevos.length > 0;

  return (
    <View>
      <Text style={styles.label}>Comprobantes</Text>

      {hayArchivos && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lista}>
          {existentes.map((a, i) => (
            <Miniatura
              key={`e${a.id}`}
              nombre={a.nombre}
              uri={a.es_imagen ? a.url : null}
              onAbrir={() => setVisor(i)}
              onQuitar={() => onQuitarExistente(a)}
            />
          ))}
          {nuevos.map((a, i) => (
            <Miniatura
              key={`n${i}-${a.uri}`}
              nombre={a.nombre}
              uri={a.mime.startsWith('image/') ? a.uri : null}
              pendiente
              onQuitar={() => onQuitarNuevo(a)}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.botones}>
        {Platform.OS !== 'web' && <BotonAgregar icono="camera-outline" texto="Cámara" onPress={tomarFoto} />}
        <BotonAgregar icono="images-outline" texto="Galería" onPress={elegirDeGaleria} />
        <BotonAgregar icono="document-attach-outline" texto="Archivo" onPress={elegirArchivo} />
      </View>
      {!hayArchivos && (
        <Text style={styles.ayuda}>
          <Ionicons name="shield-checkmark-outline" size={13} color={colores.textoSuave} /> Guarda la foto de la
          factura o el PDF para tener la traza del movimiento.
        </Text>
      )}

      {visor !== null && (
        <VisorAdjuntos
          key={visor}
          adjuntos={existentes}
          indiceInicial={visor}
          onClose={() => setVisor(null)}
        />
      )}
    </View>
  );
}

function BotonAgregar({ icono, texto, onPress }: { icono: NombreIcono; texto: string; onPress: () => void }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.boton, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icono} size={18} color={colores.primario} />
      <Text style={styles.botonTexto}>{texto}</Text>
    </Pressable>
  );
}

interface MiniaturaProps {
  nombre: string;
  /** Imagen a mostrar; null para un PDF u otro documento. */
  uri: string | null;
  pendiente?: boolean;
  onAbrir?: () => void;
  onQuitar: () => void;
}

function Miniatura({ nombre, uri, pendiente = false, onAbrir, onQuitar }: MiniaturaProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View>
      <Pressable onPress={onAbrir} disabled={!onAbrir} style={styles.miniatura}>
        {uri ? (
          <Image source={{ uri }} style={styles.imagen} />
        ) : (
          <View style={styles.documento}>
            <Ionicons name="document-text" size={28} color={colores.gasto} />
            <Text style={styles.documentoNombre} numberOfLines={2}>
              {nombre}
            </Text>
          </View>
        )}
        {pendiente && (
          <View style={styles.pendiente}>
            <Ionicons name="cloud-upload-outline" size={12} color="#fff" />
          </View>
        )}
      </Pressable>
      <Pressable onPress={onQuitar} hitSlop={8} style={styles.quitar} accessibilityLabel={`Quitar ${nombre}`}>
        <Ionicons name="close" size={14} color="#fff" />
      </Pressable>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    label: { fontSize: 14, fontWeight: '600', color: colores.textoSuave, marginBottom: 10 },
    lista: { gap: 12, paddingTop: 6, paddingRight: 6, marginBottom: 12 },
    botones: { flexDirection: 'row', gap: 8 },
    boton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: radio.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colores.primario,
      backgroundColor: colores.primarioSuave,
    },
    botonTexto: { color: colores.primario, fontWeight: '600' },
    ayuda: { color: colores.textoSuave, fontSize: 12, marginTop: 8 },
    miniatura: {
      width: 76,
      height: 76,
      borderRadius: radio.md,
      overflow: 'hidden',
      backgroundColor: colores.superficie,
    },
    imagen: { width: '100%', height: '100%' },
    documento: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 2 },
    documentoNombre: { fontSize: 9, color: colores.textoSuave, textAlign: 'center' },
    pendiente: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      backgroundColor: colores.primario,
      borderRadius: radio.xs,
      padding: 3,
    },
    quitar: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colores.gasto,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

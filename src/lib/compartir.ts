import { File as ArchivoLocal, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { Adjunto } from './types';

/** Nombre del archivo en la caché del celular (sin caracteres raros). */
const nombreEnCache = (adjunto: Adjunto) => `${adjunto.id}-${adjunto.nombre.replace(/[^\w.-]+/g, '_')}`;

/** Descarga el comprobante (enlace firmado) a la caché para poder compartirlo como archivo. */
function descargar(adjunto: Adjunto) {
  return ArchivoLocal.downloadFileAsync(adjunto.url, new ArchivoLocal(Paths.cache, nombreEnCache(adjunto)), {
    idempotent: true,
  });
}

/**
 * Comparte el archivo real (no un enlace, que vence en 30 min) por WhatsApp, correo, Drive…
 * En web usa el menú de compartir del navegador si lo soporta; si no, lo descarga.
 */
export async function compartirAdjunto(adjunto: Adjunto) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(adjunto.url)).blob();
    const archivo = new globalThis.File([blob], adjunto.nombre, { type: adjunto.mime });
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: adjunto.nombre });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') throw e; // el usuario cerró el menú
      }
      return;
    }
    descargarEnNavegador(blob, adjunto.nombre);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite compartir archivos.');
  }
  const archivo = await descargar(adjunto);
  await Sharing.shareAsync(archivo.uri, { mimeType: adjunto.mime, dialogTitle: `Compartir ${adjunto.nombre}` });
}

/**
 * Abre el comprobante con el visor del sistema: pestaña nueva en web, visor
 * integrado en iOS y, en Android, el menú "Abrir con…" (visor de PDF, Drive…).
 */
export async function abrirAdjunto(adjunto: Adjunto) {
  if (Platform.OS === 'web') {
    window.open(adjunto.url, '_blank', 'noopener');
  } else if (Platform.OS === 'ios') {
    await WebBrowser.openBrowserAsync(adjunto.url);
  } else {
    const archivo = await descargar(adjunto);
    await Sharing.shareAsync(archivo.uri, { mimeType: adjunto.mime, dialogTitle: `Abrir ${adjunto.nombre}` });
  }
}

function descargarEnNavegador(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

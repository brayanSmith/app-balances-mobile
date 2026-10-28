import type * as GoogleSignInModulo from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

/*
 * "Continuar con Google" con el selector de cuentas nativo de Android. La app solo
 * obtiene el ID token; la API lo verifica con Google y entrega la sesión.
 */

/**
 * Es un módulo nativo: no está en Expo Go (ni en web). Ahí el botón no se muestra
 * y lo demás funciona igual; hace falta un APK (EAS) para probarlo.
 */
function cargar(): typeof GoogleSignInModulo | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}

const modulo = cargar();
// El ID de cliente "Web" de Google Cloud: los ID tokens salen emitidos para él
// y es el que la API acepta (GOOGLE_CLIENT_IDS).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export const googleDisponible = modulo !== null && !!WEB_CLIENT_ID;

let configurado = false;

/**
 * Abre el selector de cuentas de Google. Devuelve el ID token, o null si la
 * persona cerró el selector sin elegir.
 */
export async function iniciarConGoogle(): Promise<string | null> {
  if (!modulo || !WEB_CLIENT_ID) throw new Error('El inicio con Google no está disponible en esta versión de la app.');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = modulo;

  if (!configurado) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    configurado = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const respuesta = await GoogleSignin.signIn();
    if (!isSuccessResponse(respuesta)) return null;
    if (!respuesta.data.idToken) throw new Error('Google no devolvió la identificación de la cuenta. Inténtalo de nuevo.');
    return respuesta.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) return null;
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Este celular no tiene Google Play Services actualizado.');
      }
    }
    throw new Error('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
  }
}

/** Al cerrar sesión: la próxima vez vuelve a preguntar con qué cuenta entrar. */
export async function cerrarGoogle() {
  if (!modulo || !configurado) return;
  await modulo.GoogleSignin.signOut().catch(() => {});
}

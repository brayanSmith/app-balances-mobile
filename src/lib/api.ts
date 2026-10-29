import { create, isAxiosError } from 'axios';
import { Platform } from 'react-native';

import { invalidarCache } from './offline';

import type {
  Adjunto,
  AgrupacionAnalisis,
  Analisis,
  ArchivoLocal,
  User,
} from './types';

export const api = create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: { Accept: 'application/json' },
});

// Peticiones que escriben pero no cambian los datos del análisis.
const SIN_CAMBIOS = [
  '/login',
  '/register',
  '/auth/google',
  '/logout',
  '/password/codigo',
  '/password/restablecer',
  '/perfil',
  '/perfil/password',
  '/perfil/foto',
  '/importaciones/previsualizar',
  '/importaciones/comprimidos',
];

// El análisis todavía se calcula en la API y se guarda en caché: si algo cambia allá
// (sincronizar, importar, restablecer), se vuelve a pedir la próxima vez.
api.interceptors.response.use((respuesta) => {
  const metodo = respuesta.config.method?.toLowerCase() ?? 'get';
  const ruta = respuesta.config.url ?? '';
  if (metodo !== 'get' && !SIN_CAMBIOS.includes(ruta)) invalidarCache(['analisis:']);
  return respuesta;
});

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

// Convierte los errores de Laravel (422, 401, red caída...) en un mensaje legible.
export function mensajeDeError(error: unknown): string {
  if (!isAxiosError(error)) {
    // SinConexionError: sin red y sin datos guardados todavía. ErrorDeDatos: validación de la base local.
    const propio = error instanceof Error && ['SinConexionError', 'ErrorDeDatos'].includes(error.name);
    return propio ? error.message : 'Ocurrió un error inesperado.';
  }
  if (!error.response) return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

  const data = error.response.data as { message?: string; errors?: Record<string, string[]> };
  const primerError = data.errors && Object.values(data.errors)[0]?.[0];
  return primerError ?? data.message ?? `Error ${error.response.status}`;
}

interface AuthResponse {
  user: User;
  token: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/login', { email, password }).then((r) => r.data),
  register: (name: string, email: string, password: string) =>
    api.post<AuthResponse>('/register', { name, email, password }).then((r) => r.data),
  /** Entra (o crea la cuenta) con el ID token que dio Google. */
  google: (idToken: string) => api.post<AuthResponse>('/auth/google', { id_token: idToken }).then((r) => r.data),
  logout: () => api.post('/logout'),
  /** "¿Olvidaste tu contraseña?": envía un código de 6 dígitos al correo. */
  pedirCodigo: (email: string) =>
    // Más tiempo que el resto: el servidor de desarrollo puede tardar en enviar el correo.
    api.post<{ message: string }>('/password/codigo', { email }, { timeout: 30000 }).then((r) => r.data),
  restablecerPassword: (email: string, codigo: string, password: string) =>
    api.post<AuthResponse>('/password/restablecer', { email, codigo, password }).then((r) => r.data),
  user: () => api.get<User>('/user').then((r) => r.data),
};

/** FormData con un archivo elegido en el dispositivo (campo `campo`) y campos extra. */
async function formularioConArchivo(archivo: ArchivoLocal, campos: Record<string, string> = {}, campo = 'archivo') {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // En web se sube el File del navegador (o el blob de su URI).
    form.append(campo, archivo.file ?? (await (await fetch(archivo.uri)).blob()), archivo.nombre);
  } else {
    // En Android/iOS, React Native acepta { uri, name, type } como archivo.
    form.append(campo, { uri: archivo.uri, name: archivo.nombre, type: archivo.mime } as unknown as Blob);
  }
  for (const [nombre, valor] of Object.entries(campos)) form.append(nombre, valor);
  return form;
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 };

/**
 * Comprobantes: los archivos viven en la API (los datos del movimiento, en la base
 * local). Se identifican por el uuid del movimiento; el id numérico es de versiones anteriores.
 */
export const adjuntosApi = {
  listar: (movimientoId: string) =>
    api.get<{ data: Adjunto[] }>(`/movimientos/${movimientoId}/adjuntos`).then((r) => r.data.data),
  subir: async (movimientoId: string | number, archivo: ArchivoLocal) =>
    api
      .post<{ data: Adjunto }>(`/movimientos/${movimientoId}/adjuntos`, await formularioConArchivo(archivo), multipart)
      .then((r) => r.data.data),
  eliminar: (id: number) => api.delete(`/adjuntos/${id}`),
};

export const analisisApi = {
  /** Saldo agrupado (área y velas) y, con `proyectar_hasta` (AAAA-MM), su proyección. */
  obtener: (params: { desde: string; hasta: string; agrupacion: AgrupacionAnalisis; proyectar_hasta?: string }) =>
    api.get<Analisis>('/analisis', { params }).then((r) => r.data),
};

/** "Mi perfil": todas devuelven el usuario actualizado (menos la contraseña). */
export const perfilApi = {
  /** Cambiar el correo pide la contraseña actual. */
  actualizar: (datos: { name: string; email: string; password_actual?: string }) =>
    api.put<User>('/perfil', datos).then((r) => r.data),
  /** Sin `password_actual` (null): crea la contraseña de quien entró con Google. */
  cambiarPassword: (password_actual: string | null, password: string, password_confirmation: string) =>
    api.put<{ message: string }>('/perfil/password', {
      ...(password_actual !== null && { password_actual }),
      password,
      password_confirmation,
    }),
  subirFoto: async (foto: ArchivoLocal) =>
    api.post<User>('/perfil/foto', await formularioConArchivo(foto, {}, 'foto'), multipart).then((r) => r.data),
  quitarFoto: () => api.delete<User>('/perfil/foto').then((r) => r.data),
};

export const cuentaApi = {
  /** Borra todos los datos del tenant (requiere escribir BORRAR y la contraseña). */
  restablecer: (password: string, confirmacion: string) =>
    api.post<{ message: string }>('/cuenta/restablecer', { password, confirmacion }).then((r) => r.data),
  /** La cuenta pasó a "solo en el teléfono" y ya se bajó todo: se borra del servidor. */
  liberarNube: () => api.post('/cuenta/liberar-nube'),
  /** Elimina la cuenta y todos sus datos (escribir ELIMINAR; la contraseña si la cuenta tiene). */
  eliminar: (confirmacion: string, password: string | null) =>
    api.delete('/cuenta', { data: { confirmacion, ...(password !== null && { password }) } }),
};

/** CSV de ejemplo para importar (público: no tiene datos del usuario). */
export const urlPlantilla = () => `${process.env.EXPO_PUBLIC_API_URL}/importaciones/plantilla`;

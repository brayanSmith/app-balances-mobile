import { create, isAxiosError } from 'axios';
import { Platform } from 'react-native';

import { invalidarCache } from './offline';

import type {
  Adjunto,
  ArchivoLocal,
  Categoria,
  CategoriaInput,
  ComprimidoSubido,
  FiltrosMovimientos,
  FormatoFecha,
  Importacion,
  MapeoImportacion,
  Movimiento,
  MovimientoInput,
  PagoInput,
  Pagina,
  Pendiente,
  Previsualizacion,
  Resumen,
  ResultadoImportacion,
  User,
} from './types';

export const api = create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: { Accept: 'application/json' },
});

// Peticiones que escriben pero no cambian movimientos ni categorías.
const SIN_CAMBIOS = ['/login', '/register', '/logout', '/importaciones/previsualizar', '/importaciones/comprimidos'];

// Cuando se crea, edita o borra algo, lo que está en caché ya no sirve: se vuelve
// a pedir la próxima vez. Una categoría o el restablecer afectan a todo; lo demás
// (movimientos, pagos, adjuntos, importaciones) a los movimientos y totales.
api.interceptors.response.use((respuesta) => {
  const metodo = respuesta.config.method?.toLowerCase() ?? 'get';
  const ruta = respuesta.config.url ?? '';
  if (metodo !== 'get' && !SIN_CAMBIOS.includes(ruta)) {
    const todo = ruta.startsWith('/categorias') || ruta.startsWith('/cuenta');
    invalidarCache(todo ? undefined : ['inicio:', 'historial:', 'recordatorios']);
  }
  return respuesta;
});

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

// Convierte los errores de Laravel (422, 401, red caída...) en un mensaje legible.
export function mensajeDeError(error: unknown): string {
  if (!isAxiosError(error)) {
    // p. ej. SinConexionError: sin red y sin datos guardados todavía.
    return error instanceof Error && error.name === 'SinConexionError' ? error.message : 'Ocurrió un error inesperado.';
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
  logout: () => api.post('/logout'),
  user: () => api.get<User>('/user').then((r) => r.data),
};

export const movimientosApi = {
  listar: (filtros: FiltrosMovimientos) =>
    api.get<{ data: Movimiento[] }>('/movimientos', { params: filtros }).then((r) => r.data.data),
  /** Listado paginado de a 30 (historial). */
  pagina: (filtros: FiltrosMovimientos, page: number) =>
    api.get<Pagina<Movimiento>>('/movimientos', { params: { ...filtros, page } }).then((r) => r.data),
  resumen: (filtros: FiltrosMovimientos) =>
    api.get<Resumen>('/movimientos/resumen', { params: filtros }).then((r) => r.data),
  ver: (id: number) => api.get<{ data: Movimiento }>(`/movimientos/${id}`).then((r) => r.data.data),
  crear: (input: MovimientoInput) =>
    api.post<{ data: Movimiento }>('/movimientos', input).then((r) => r.data.data),
  actualizar: (id: number, input: MovimientoInput) =>
    api.put<{ data: Movimiento }>(`/movimientos/${id}`, input).then((r) => r.data.data),
  eliminar: (id: number) => api.delete(`/movimientos/${id}`),
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

export const adjuntosApi = {
  subir: async (movimientoId: number, archivo: ArchivoLocal) =>
    api
      .post<{ data: Adjunto }>(`/movimientos/${movimientoId}/adjuntos`, await formularioConArchivo(archivo), multipart)
      .then((r) => r.data.data),
  eliminar: (id: number) => api.delete(`/adjuntos/${id}`),
};

export const programacionesApi = {
  /** Vencidos, los que vencen en los próximos `dias` (7) y, con `mes`, todo lo que vence hasta fin de ese mes. */
  pendientes: (params: { mes?: string; dias?: number } = {}) =>
    api.get<{ data: Pendiente[] }>('/programaciones/pendientes', { params }).then((r) => r.data.data),
  /** Registra el pago real del vencimiento pendiente; devuelve el movimiento creado. */
  pagar: (id: number, pago: PagoInput) =>
    api.post<{ data: Movimiento }>(`/programaciones/${id}/pagar`, pago).then((r) => r.data.data),
  omitir: (id: number) => api.post(`/programaciones/${id}/omitir`),
};

export const cuentaApi = {
  /** Borra todos los datos del tenant (requiere escribir BORRAR y la contraseña). */
  restablecer: (password: string, confirmacion: string) =>
    api.post<{ message: string }>('/cuenta/restablecer', { password, confirmacion }).then((r) => r.data),
};

export const categoriasApi = {
  listar: () => api.get<{ data: Categoria[] }>('/categorias').then((r) => r.data.data),
  crear: (input: CategoriaInput) =>
    api.post<{ data: Categoria }>('/categorias', input).then((r) => r.data.data),
  actualizar: (id: number, input: CategoriaInput) =>
    api.put<{ data: Categoria }>(`/categorias/${id}`, input).then((r) => r.data.data),
  eliminar: (id: number) => api.delete(`/categorias/${id}`),
};

/** Opciones de la importación como campos de formulario: mapeo[fecha]=Fecha, ... (vacío = sin columna). */
interface OpcionesImportacion {
  mapeo?: MapeoImportacion;
  formato?: FormatoFecha;
  /** Token del ZIP/RAR con los adjuntos (ver subirComprimido). */
  comprimido?: string | null;
}

function camposImportacion({ mapeo, formato, comprimido }: OpcionesImportacion) {
  const campos: Record<string, string> = {};
  if (mapeo) for (const [campo, columna] of Object.entries(mapeo)) campos[`mapeo[${campo}]`] = columna ?? '';
  if (formato) campos.formato_fecha = formato;
  if (comprimido) campos.comprimido = comprimido;
  return campos;
}

export const importacionesApi = {
  /** Lee el CSV y devuelve columnas, mapeo (sugerido si no se envía) y vista previa. No guarda nada. */
  previsualizar: async (archivo: ArchivoLocal, opciones: OpcionesImportacion = {}) =>
    api
      .post<Previsualizacion>(
        '/importaciones/previsualizar',
        await formularioConArchivo(archivo, camposImportacion(opciones)),
        multipart,
      )
      .then((r) => r.data),
  importar: async (archivo: ArchivoLocal, opciones: Required<OpcionesImportacion>, omitirErrores: boolean) =>
    api
      .post<ResultadoImportacion>(
        '/importaciones',
        await formularioConArchivo(archivo, {
          ...camposImportacion(opciones),
          omitir_errores: omitirErrores ? '1' : '0',
        }),
        multipart,
      )
      .then((r) => r.data),
  /** Sube y extrae el ZIP/RAR con los comprobantes; puede tardar con archivos grandes. */
  subirComprimido: async (archivo: ArchivoLocal) =>
    api
      .post<ComprimidoSubido>('/importaciones/comprimidos', await formularioConArchivo(archivo, {}, 'comprimido'), {
        ...multipart,
        timeout: 300000,
      })
      .then((r) => r.data),
  listar: () => api.get<{ data: Importacion[] }>('/importaciones').then((r) => r.data.data),
  deshacer: (id: number) => api.delete(`/importaciones/${id}`),
  urlPlantilla: () => `${process.env.EXPO_PUBLIC_API_URL}/importaciones/plantilla`,
};

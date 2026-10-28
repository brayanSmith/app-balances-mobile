import { isAxiosError } from 'axios';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { authApi, setAuthToken } from '@/lib/api';
import { borrarCache, usarCacheDe } from '@/lib/offline';
import { cerrarGoogle, iniciarConGoogle } from '@/lib/google';
import { cancelarRecordatorios } from '@/lib/recordatorios';
import { getItem, setItem } from '@/lib/storage';
import type { User } from '@/lib/types';

const TOKEN_KEY = 'auth_token';
// El usuario también se guarda: así se entra a la app aunque no haya conexión.
const USER_KEY = 'auth_user';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  /** Selector de cuentas de Google; si se cancela, no pasa nada. Crea la cuenta si no existe. */
  signInConGoogle: () => Promise<void>;
  /** Con el código que llegó al correo: cambia la contraseña e inicia sesión. */
  restablecerPassword: (email: string, codigo: string, password: string) => Promise<void>;
  /** Tras editar el perfil: reemplaza el usuario en memoria y el guardado. */
  actualizarUsuario: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useSession() {
  const value = use(AuthContext);
  if (!value) throw new Error('useSession debe usarse dentro de <SessionProvider />');
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // La caché es de cada usuario: se elige antes de que las pantallas pidan datos.
  function cambiarUsuario(nuevo: User | null) {
    usarCacheDe(nuevo?.id ?? null);
    setUser(nuevo);
  }

  async function cerrarLocalmente() {
    await setItem(TOKEN_KEY, null);
    await setItem(USER_KEY, null);
    setAuthToken(null);
    cambiarUsuario(null);
    await borrarCache().catch(() => {});
    // Los recordatorios agendados son de esta cuenta.
    await cancelarRecordatorios().catch(() => {});
    // Y la próxima vez Google vuelve a preguntar con qué cuenta entrar.
    await cerrarGoogle();
  }

  // Al abrir la app: si hay sesión guardada se entra de inmediato con el usuario
  // guardado y se valida contra la API en segundo plano. Solo un 401 (token
  // vencido o revocado) cierra la sesión; sin red se sigue con lo guardado.
  useEffect(() => {
    (async () => {
      const token = await getItem(TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }
      setAuthToken(token);

      const guardado = await getItem(USER_KEY);
      if (guardado) {
        cambiarUsuario(JSON.parse(guardado) as User);
        setIsLoading(false);
      }

      try {
        const actual = await authApi.user();
        cambiarUsuario(actual);
        await setItem(USER_KEY, JSON.stringify(actual));
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) await cerrarLocalmente();
      } finally {
        setIsLoading(false);
      }
    })();
    // Solo al abrir la app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardarSesion({ user, token }: { user: User; token: string }) {
    await setItem(TOKEN_KEY, token);
    await setItem(USER_KEY, JSON.stringify(user));
    setAuthToken(token);
    cambiarUsuario(user);
  }

  const value: AuthContextValue = {
    user,
    isLoading,
    signIn: async (email, password) => guardarSesion(await authApi.login(email, password)),
    signUp: async (name, email, password) => guardarSesion(await authApi.register(name, email, password)),
    signInConGoogle: async () => {
      const idToken = await iniciarConGoogle();
      if (idToken) await guardarSesion(await authApi.google(idToken));
    },
    restablecerPassword: async (email, codigo, password) =>
      guardarSesion(await authApi.restablecerPassword(email, codigo, password)),
    actualizarUsuario: async (actual) => {
      setUser(actual);
      await setItem(USER_KEY, JSON.stringify(actual));
    },
    signOut: async () => {
      try {
        await authApi.logout();
      } catch {
        // Aunque falle la red, cerramos la sesión localmente.
      }
      await cerrarLocalmente();
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

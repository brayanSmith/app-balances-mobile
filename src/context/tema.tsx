import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { getItem, setItem } from '@/lib/storage';
import { paletas, type Paleta } from '@/lib/theme';

export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

const PREFERENCIA_KEY = 'tema';

interface TemaContextValue {
  colores: Paleta;
  esOscuro: boolean;
  preferencia: PreferenciaTema;
  setPreferencia: (preferencia: PreferenciaTema) => void;
}

const TemaContext = createContext<TemaContextValue | null>(null);

export function useTema() {
  const value = use(TemaContext);
  if (!value) throw new Error('useTema debe usarse dentro de <TemaProvider />');
  return value;
}

/**
 * Estilos que dependen del tema. `crear` debe definirse fuera del componente
 * para que solo se recalculen al cambiar entre claro y oscuro.
 */
export function useEstilos<T>(crear: (colores: Paleta) => T): T {
  const { colores } = useTema();
  return useMemo(() => crear(colores), [crear, colores]);
}

/** Modo claro/oscuro: por defecto sigue al sistema; la elección del usuario se recuerda. */
export function TemaProvider({ children }: PropsWithChildren) {
  const sistema = useColorScheme();
  const [preferencia, setPreferenciaState] = useState<PreferenciaTema>('sistema');

  useEffect(() => {
    getItem(PREFERENCIA_KEY)
      .then((guardada) => {
        if (guardada === 'claro' || guardada === 'oscuro') setPreferenciaState(guardada);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<TemaContextValue>(() => {
    const esOscuro = preferencia === 'sistema' ? sistema === 'dark' : preferencia === 'oscuro';
    return {
      colores: esOscuro ? paletas.oscuro : paletas.claro,
      esOscuro,
      preferencia,
      setPreferencia: (nueva) => {
        setPreferenciaState(nueva);
        setItem(PREFERENCIA_KEY, nueva === 'sistema' ? null : nueva).catch(() => {});
      },
    };
  }, [preferencia, sistema]);

  return <TemaContext value={value}>{children}</TemaContext>;
}

import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

import { useSincronizacion } from '@/context/sincronizacion';
import { categoriasApi } from '@/lib/api';
import { conCache } from '@/lib/offline';
import type { Categoria } from '@/lib/types';

interface CategoriasContextValue {
  categorias: Categoria[];
  recargar: () => Promise<void>;
}

const CategoriasContext = createContext<CategoriasContextValue | null>(null);

export function useCategorias() {
  const value = use(CategoriasContext);
  if (!value) throw new Error('useCategorias debe usarse dentro de <CategoriasProvider />');
  return value;
}

const pedir = () => conCache('categorias', categoriasApi.listar).then((r) => r.datos);

/** Categorías del tenant, cargadas una vez y compartidas por todas las pantallas (también sin conexión). */
export function CategoriasProvider({ children }: PropsWithChildren) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  // Al volver la conexión se vuelven a pedir (pueden venir de la copia guardada).
  const { version } = useSincronizacion();

  const recargar = useCallback(async () => {
    try {
      setCategorias(await pedir());
    } catch {
      // Sin categorías la app sigue funcionando; se reintenta en la próxima recarga.
    }
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir()
      .then((lista) => vigente && setCategorias(lista))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [version]);

  return <CategoriasContext value={{ categorias, recargar }}>{children}</CategoriasContext>;
}

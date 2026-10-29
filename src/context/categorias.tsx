import { createContext, use, type PropsWithChildren } from 'react';

import { categoriasDb } from '@/lib/db/categorias';
import { useConsulta } from '@/lib/db/useConsulta';
import type { Categoria } from '@/lib/types';

interface CategoriasContextValue {
  categorias: Categoria[];
}

const CategoriasContext = createContext<CategoriasContextValue | null>(null);

export function useCategorias() {
  const value = use(CategoriasContext);
  if (!value) throw new Error('useCategorias debe usarse dentro de <CategoriasProvider />');
  return value;
}

/** Categorías de la base local, compartidas por todas las pantallas; se actualizan solas al cambiar. */
export function CategoriasProvider({ children }: PropsWithChildren) {
  const { datos } = useConsulta(categoriasDb.listar, ['categorias'], []);

  return <CategoriasContext value={{ categorias: datos ?? [] }}>{children}</CategoriasContext>;
}

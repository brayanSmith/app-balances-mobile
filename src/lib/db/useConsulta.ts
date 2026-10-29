import { useEffect, useState, type DependencyList } from 'react';

import { alCambiar, type Tabla } from './index';

interface Estado<T> {
  datos: T | undefined;
  error: unknown;
  cargando: boolean;
}

/**
 * Corre `consulta` sobre la base local y la repite cada vez que cambia alguna de
 * `tablas` (una edición, o lo que bajó la sincronización). Mientras recarga se
 * siguen mostrando los datos anteriores.
 */
export function useConsulta<T>(consulta: () => Promise<T>, tablas: Tabla[], deps: DependencyList): Estado<T> {
  const [estado, setEstado] = useState<Estado<T>>({ datos: undefined, error: null, cargando: true });

  useEffect(() => {
    let vigente = true;
    const cargar = () => {
      setEstado((anterior) => ({ ...anterior, cargando: true }));
      consulta().then(
        (datos) => vigente && setEstado({ datos, error: null, cargando: false }),
        (error: unknown) => vigente && setEstado((anterior) => ({ ...anterior, error, cargando: false })),
      );
    };

    cargar();
    const quitar = alCambiar((cambiadas) => {
      if (cambiadas.some((tabla) => tablas.includes(tabla))) cargar();
    });
    return () => {
      vigente = false;
      quitar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las dependencias las da quien llama
  }, deps);

  return estado;
}

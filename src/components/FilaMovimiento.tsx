import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoriaIcono } from '@/components/CategoriaIcono';
import { useEstilos, useTema } from '@/context/tema';
import { etiquetaDia, formatearFechaCorta, formatearMonto, nombreMes } from '@/lib/format';
import { radio, type Paleta } from '@/lib/theme';
import type { Evolucion, Movimiento } from '@/lib/types';

/** Agrupa por día para un SectionList (los movimientos ya vienen del más reciente al más antiguo). */
export function agruparPorDia(movimientos: Movimiento[]) {
  const porDia = new Map<string, Movimiento[]>();
  for (const m of movimientos) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);
  return [...porDia].map(([fecha, data]) => ({ titulo: etiquetaDia(fecha), data }));
}

/**
 * Por día, con los totales de cada día que calculó la API en la evolución diaria:
 * son exactos aunque la lista esté paginada. Sin ella (p. ej. sin conexión), sin totales.
 */
export function agruparPorDiaConTotales(movimientos: Movimiento[], evolucion: Evolucion | null | undefined) {
  const totales = new Map(evolucion?.agrupacion === 'dia' ? evolucion.puntos.map((p) => [p.desde, p]) : []);
  return agruparPorDia(movimientos).map((seccion) => {
    const total = totales.get(seccion.data[0].fecha);
    return { ...seccion, ingresos: total?.ingresos, gastos: total?.gastos };
  });
}

/** Una semana, mes o año del historial agrupado (sin el detalle de sus movimientos). */
export interface Grupo {
  desde: string;
  hasta: string;
  ingresos: number;
  gastos: number;
}

/** "Semana del 5 oct 2026", "Octubre 2026", "2026". */
function tituloGrupo(desde: string, agrupacion: Evolucion['agrupacion']) {
  const [anio, mes] = desde.split('-').map(Number);
  if (agrupacion === 'anio') return String(anio);
  if (agrupacion === 'mes') return nombreMes(new Date(anio, mes - 1, 1));
  return `Semana del ${formatearFechaCorta(desde)}`;
}

interface FilaGrupoProps {
  grupo: Grupo;
  agrupacion: Evolucion['agrupacion'];
  /** Filtro de tipo del historial: con uno solo se muestra solo ese total. */
  tipo: 'todos' | Movimiento['tipo'];
  /** Sus movimientos se están mostrando debajo. */
  desplegado: boolean;
  onPress: () => void;
}

/** Fila con los totales de un grupo; tocarla despliega (o cierra) sus movimientos debajo. */
export function FilaGrupo({ grupo, agrupacion, tipo, desplegado, onPress }: FilaGrupoProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const balance = grupo.ingresos - grupo.gastos;
  // Con un solo tipo el número grande es ese total; con ambos, el balance.
  const principal = tipo === 'ingreso' ? grupo.ingresos : tipo === 'gasto' ? -grupo.gastos : balance;

  return (
    <Pressable
      style={({ pressed }) => [styles.fila, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: desplegado }}
    >
      <View style={styles.grupoIcono}>
        <Ionicons name="calendar-outline" size={20} color={colores.primario} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.descripcion} numberOfLines={1}>
          {tituloGrupo(grupo.desde, agrupacion)}
        </Text>
        {tipo === 'todos' && (
          <View style={styles.detalleFila}>
            <Text style={[styles.detalle, { color: colores.ingreso }]}>+{formatearMonto(grupo.ingresos)}</Text>
            <Text style={[styles.detalle, { color: colores.gasto }]}>−{formatearMonto(grupo.gastos)}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.monto, { color: principal < 0 ? colores.gasto : colores.ingreso }]}>
        {principal < 0 ? '−' : '+'}
        {formatearMonto(Math.abs(principal))}
      </Text>
      <Ionicons name={desplegado ? 'chevron-up' : 'chevron-down'} size={18} color={colores.textoSuave} />
    </Pressable>
  );
}

export function EncabezadoDia({ titulo, ingresos, gastos }: { titulo: string; ingresos?: number; gastos?: number }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.encabezado}>
      <Text style={styles.dia} numberOfLines={1}>
        {titulo}
      </Text>
      {/* Solo los totales que no son 0 (con el filtro de tipo, uno de los dos siempre lo es). */}
      {!!ingresos && <Text style={[styles.total, { color: colores.ingreso }]}>+{formatearMonto(ingresos)}</Text>}
      {!!gastos && <Text style={[styles.total, { color: colores.gasto }]}>−{formatearMonto(gastos)}</Text>}
    </View>
  );
}

export function FilaMovimiento({ movimiento, onPress }: { movimiento: Movimiento; onPress: () => void }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const esIngreso = movimiento.tipo === 'ingreso';

  return (
    <Pressable style={({ pressed }) => [styles.fila, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <CategoriaIcono categoria={movimiento.categoria} />
      <View style={{ flex: 1 }}>
        <Text style={styles.descripcion} numberOfLines={1}>
          {movimiento.descripcion}
        </Text>
        <View style={styles.detalleFila}>
          <Text style={styles.detalle}>{movimiento.categoria?.nombre ?? 'Sin categoría'}</Text>
          {movimiento.local && (
            <View style={[styles.etiqueta, movimiento.local.error ? styles.etiquetaError : styles.etiquetaLocal]}>
              <Ionicons
                name={movimiento.local.error ? 'alert-circle' : movimiento.local.enviando ? 'sync' : 'cloud-upload-outline'}
                size={12}
                color={movimiento.local.error ? colores.gasto : colores.aviso}
              />
              <Text style={[styles.etiquetaTexto, { color: movimiento.local.error ? colores.gasto : colores.aviso }]}>
                {movimiento.local.error ? 'No se envió' : movimiento.local.enviando ? 'Enviando…' : 'Sin enviar'}
              </Text>
            </View>
          )}
          {movimiento.programado && (
            <View style={styles.etiqueta}>
              <Ionicons name="repeat" size={11} color={colores.primario} />
              <Text style={styles.etiquetaTexto}>Programado</Text>
            </View>
          )}
          {movimiento.adjuntos_count > 0 && (
            <View style={styles.etiqueta}>
              <Ionicons name="attach" size={12} color={colores.primario} />
              <Text style={styles.etiquetaTexto}>{movimiento.adjuntos_count}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.monto, { color: esIngreso ? colores.ingreso : colores.gasto }]}>
        {esIngreso ? '+' : '−'}
        {formatearMonto(movimiento.monto)}
      </Text>
    </Pressable>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    encabezado: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8 },
    dia: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colores.textoSuave,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    total: { fontSize: 12, fontWeight: '700' },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      boxShadow: colores.sombra,
    },
    descripcion: { fontSize: 16, color: colores.texto, fontWeight: '600' },
    detalleFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    detalle: { fontSize: 13, color: colores.textoSuave },
    etiqueta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colores.primarioSuave,
      borderRadius: radio.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    etiquetaTexto: { fontSize: 11, fontWeight: '600', color: colores.primario },
    etiquetaLocal: { backgroundColor: colores.avisoSuave },
    etiquetaError: { backgroundColor: colores.gastoSuave },
    monto: { fontSize: 16, fontWeight: '700' },
    grupoIcono: {
      width: 40,
      height: 40,
      borderRadius: radio.md,
      backgroundColor: colores.primarioSuave,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

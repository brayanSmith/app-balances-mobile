import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoriaIcono } from '@/components/CategoriaIcono';
import { useEstilos, useTema } from '@/context/tema';
import { formatearFechaCorta, formatearMonto } from '@/lib/format';
import { radio, type Paleta } from '@/lib/theme';
import type { Pendiente } from '@/lib/types';

/** Cuántos se ven antes de "Ver todos". */
const VISIBLES = 4;

/**
 * "Venció hace 3 días" / "Vence hoy" / "Vence en 4 días" / "Vence el 20 nov"
 * (o "Llega…" si es un ingreso).
 */
export function textoVencimiento(p: Pendiente) {
  const ingreso = p.tipo === 'ingreso';
  if (p.estado === 'hoy') return ingreso ? 'Llega hoy' : 'Vence hoy';
  if (p.estado === 'vencido') {
    const dias = -p.dias;
    const tiempo = `${dias} ${dias === 1 ? 'día' : 'días'}`;
    return ingreso ? `Atrasado ${tiempo}` : `Venció hace ${tiempo}`;
  }
  if (p.dias === 1) return ingreso ? 'Llega mañana' : 'Vence mañana';
  if (p.dias > 7) return `${ingreso ? 'Llega' : 'Vence'} el ${formatearFechaCorta(p.vence).slice(0, -5)}`;
  return ingreso ? `Llega en ${p.dias} días` : `Vence en ${p.dias} días`;
}

interface Props {
  pendientes: Pendiente[];
  /** Mes que se está viendo en el inicio, p. ej. "Noviembre 2026". */
  mes: string;
  onPagar: (pendiente: Pendiente) => void;
}

/**
 * Lo que hay por pagar (o recibir) hasta el fin del mes que se está viendo,
 * con lo vencido primero. Cada uno tiene su botón para confirmar el pago,
 * también por adelantado.
 */
export function PagosPendientes({ pendientes, mes, onPagar }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [verTodos, setVerTodos] = useState(false);

  const vencidos = pendientes.filter((p) => p.estado === 'vencido').length;
  const porPagar = pendientes.filter((p) => p.tipo === 'gasto').reduce((total, p) => total + p.monto, 0);
  const visibles = verTodos ? pendientes : pendientes.slice(0, VISIBLES);
  const urgente = vencidos > 0 || pendientes.some((p) => p.estado === 'hoy');

  const colorEstado = (p: Pendiente) =>
    p.estado === 'vencido' ? colores.gasto : p.estado === 'hoy' ? colores.aviso : colores.textoSuave;

  return (
    <View style={[styles.tarjeta, urgente && { borderColor: vencidos ? colores.gasto : colores.aviso }]}>
      <View style={styles.cabecera}>
        <View style={[styles.campana, { backgroundColor: vencidos ? colores.gastoSuave : colores.avisoSuave }]}>
          <Ionicons name="notifications" size={18} color={vencidos ? colores.gasto : colores.aviso} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Por pagar</Text>
          <Text style={styles.subtitulo} numberOfLines={1}>
            {vencidos > 0 ? `${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'} · ` : ''}
            Hasta fin de {mes.split(' ')[0].toLowerCase()}
          </Text>
        </View>
        {porPagar > 0 && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.totalTexto}>Total estimado</Text>
            <Text style={styles.total}>{formatearMonto(porPagar)}</Text>
          </View>
        )}
      </View>

      {visibles.map((p) => (
        <View key={p.id} style={styles.fila}>
          <CategoriaIcono categoria={p.categoria} tamano={38} />
          <View style={{ flex: 1 }}>
            <Text style={styles.descripcion} numberOfLines={1}>
              {p.descripcion}
            </Text>
            <Text style={[styles.estado, { color: colorEstado(p) }]} numberOfLines={1}>
              {textoVencimiento(p)}
              {p.periodos_vencidos > 1 ? ` · ${p.periodos_vencidos} periodos` : ''}
              <Text style={styles.estimado}>  ≈ {formatearMonto(p.monto)}</Text>
            </Text>
          </View>
          <Pressable
            onPress={() => onPagar(p)}
            style={({ pressed }) => [
              styles.boton,
              p.estado === 'proximo'
                ? { backgroundColor: colores.primarioSuave } // aún no vence: pagar por adelantado
                : { backgroundColor: p.tipo === 'ingreso' ? colores.ingreso : colores.primario },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.botonTexto, p.estado === 'proximo' && { color: colores.primario }]}>
              {p.tipo === 'ingreso' ? 'Recibir' : 'Pagar'}
            </Text>
          </Pressable>
        </View>
      ))}

      {pendientes.length > VISIBLES && (
        <Pressable onPress={() => setVerTodos((v) => !v)} style={styles.verTodos} hitSlop={6}>
          <Text style={styles.verTodosTexto}>
            {verTodos ? 'Ver menos' : `Ver todos (${pendientes.length})`}
          </Text>
          <Ionicons name={verTodos ? 'chevron-up' : 'chevron-down'} size={16} color={colores.primario} />
        </Pressable>
      )}
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    tarjeta: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      borderWidth: 1.5,
      borderColor: colores.borde,
      padding: 14,
      gap: 12,
      boxShadow: colores.sombra,
    },
    cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    campana: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    titulo: { fontSize: 16, fontWeight: '700', color: colores.texto },
    subtitulo: { fontSize: 12, color: colores.textoSuave, marginTop: 1 },
    totalTexto: { fontSize: 11, color: colores.textoSuave },
    total: { fontSize: 15, fontWeight: '800', color: colores.gasto },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colores.borde,
    },
    descripcion: { fontSize: 15, fontWeight: '600', color: colores.texto },
    estado: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    estimado: { color: colores.textoSuave, fontWeight: '400' },
    boton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radio.sm },
    botonTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
    verTodos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 2 },
    verTodosTexto: { color: colores.primario, fontWeight: '600' },
  });

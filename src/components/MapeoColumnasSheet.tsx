import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { Segmentado } from '@/components/Segmentado';
import { useEstilos, useTema } from '@/context/tema';
import { radio, type NombreIcono, type Paleta } from '@/lib/theme';
import type { CampoImportacion, FormatoFecha, MapeoImportacion } from '@/lib/types';

export const CAMPOS: { campo: CampoImportacion; texto: string; icono: NombreIcono }[] = [
  { campo: 'fecha', texto: 'Fecha', icono: 'calendar-outline' },
  { campo: 'descripcion', texto: 'Descripción', icono: 'create-outline' },
  { campo: 'monto', texto: 'Monto', icono: 'cash-outline' },
  { campo: 'tipo', texto: 'Tipo', icono: 'swap-vertical-outline' },
  { campo: 'ingreso', texto: 'Ingresos', icono: 'arrow-down-circle-outline' },
  { campo: 'gasto', texto: 'Gastos', icono: 'arrow-up-circle-outline' },
  { campo: 'categoria', texto: 'Categoría', icono: 'pricetag-outline' },
  { campo: 'adjunto', texto: 'Adjunto', icono: 'attach-outline' },
  { campo: 'programado', texto: 'Programado (SI/NO)', icono: 'repeat' },
  { campo: 'intervalo', texto: 'Cada cuánto', icono: 'timer-outline' },
  { campo: 'periodo', texto: 'Tipo de periodo', icono: 'calendar-number-outline' },
  { campo: 'hasta', texto: 'Repetir hasta', icono: 'flag-outline' },
];

/** Qué falta para poder importar (fecha, descripción y algún monto). */
export function camposFaltantes(mapeo: MapeoImportacion) {
  const faltan: string[] = [];
  if (!mapeo.fecha) faltan.push('Fecha');
  if (!mapeo.descripcion) faltan.push('Descripción');
  if (!mapeo.monto && !mapeo.ingreso && !mapeo.gasto) faltan.push('Monto (o Ingresos/Gastos)');
  return faltan;
}

interface Props {
  visible: boolean;
  columnas: string[];
  muestras: Record<string, string[]>;
  mapeo: MapeoImportacion;
  formato: FormatoFecha;
  onClose: () => void;
  onAplicar: (mapeo: MapeoImportacion, formato: FormatoFecha) => void;
}

/**
 * Relacionar cada columna del CSV con un dato, viendo sus valores de ejemplo:
 * sirve aunque el usuario haya cambiado los títulos de los encabezados.
 */
export function MapeoColumnasSheet({ visible, columnas, muestras, mapeo, formato, onClose, onAplicar }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  // Borrador: solo se aplica al pulsar "Aplicar".
  const [borrador, setBorrador] = useState(mapeo);
  const [formatoBorrador, setFormatoBorrador] = useState(formato);

  const campoDe = (columna: string) => CAMPOS.find(({ campo }) => borrador[campo] === columna)?.campo ?? null;

  // Cada dato sale de una sola columna: asignarlo a esta se lo quita a la anterior.
  function asignar(columna: string, campo: CampoImportacion | null) {
    setBorrador((actual) => {
      const nuevo = { ...actual };
      const anterior = campoDe(columna);
      if (anterior) nuevo[anterior] = null;
      if (campo) nuevo[campo] = columna;
      return nuevo;
    });
  }

  const faltan = camposFaltantes(borrador);
  const montoYColumnas = !!borrador.monto && (!!borrador.ingreso || !!borrador.gasto);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo="Relacionar columnas"
      pie={
        <Boton
          texto={faltan.length ? `Falta: ${faltan.join(', ')}` : 'Aplicar'}
          onPress={() => faltan.length === 0 && onAplicar(borrador, formatoBorrador)}
          color={faltan.length ? colores.textoSuave : undefined}
        />
      }
    >
      <Text style={styles.ayuda}>
        Indica qué es cada columna de tu archivo. Fíjate en los valores de ejemplo si el encabezado no es claro.
      </Text>

      <View style={styles.requeridos}>
        {['Fecha', 'Descripción', 'Monto'].map((r) => {
          const ok = !faltan.some((f) => f.startsWith(r));
          return (
            <View key={r} style={[styles.requerido, { backgroundColor: ok ? colores.ingresoSuave : colores.gastoSuave }]}>
              <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={15} color={ok ? colores.ingreso : colores.gasto} />
              <Text style={[styles.requeridoTexto, { color: ok ? colores.ingreso : colores.gasto }]}>{r}</Text>
            </View>
          );
        })}
      </View>

      {columnas.map((columna) => {
        const asignado = campoDe(columna);
        const ejemplos = muestras[columna] ?? [];
        return (
          <View key={columna} style={[styles.columna, asignado && { borderColor: colores.primario }]}>
            <View style={styles.columnaCabecera}>
              <Ionicons name="grid-outline" size={16} color={asignado ? colores.primario : colores.textoSuave} />
              <Text style={styles.columnaNombre} numberOfLines={1}>
                {columna}
              </Text>
              {asignado && (
                <Ionicons name="arrow-forward" size={14} color={colores.primario} />
              )}
              {asignado && (
                <Text style={styles.columnaAsignada}>{CAMPOS.find((c) => c.campo === asignado)?.texto}</Text>
              )}
            </View>
            <Text style={styles.ejemplos} numberOfLines={2}>
              {ejemplos.length ? ejemplos.join('  ·  ') : '(columna vacía)'}
            </Text>
            <View style={styles.opciones}>
              {CAMPOS.map(({ campo, texto, icono }) => {
                const activa = asignado === campo;
                const ocupadaPor = !activa ? borrador[campo] : null;
                return (
                  <Pressable
                    key={campo}
                    onPress={() => asignar(columna, activa ? null : campo)}
                    style={[styles.opcion, activa && styles.opcionActiva, !!ocupadaPor && styles.opcionOcupada]}
                  >
                    <Ionicons name={icono} size={14} color={activa ? '#fff' : colores.texto} />
                    <Text style={[styles.opcionTexto, activa && styles.opcionTextoActivo]}>{texto}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => asignar(columna, null)}
                style={[styles.opcion, !asignado && styles.opcionIgnorar]}
              >
                <Ionicons name="eye-off-outline" size={14} color={colores.textoSuave} />
                <Text style={[styles.opcionTexto, { color: colores.textoSuave }]}>Ignorar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {montoYColumnas && (
        <Text style={styles.aviso}>
          Elegiste un Monto y también columnas de Ingresos/Gastos: se usará el Monto.
        </Text>
      )}

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>Las fechas vienen como</Text>
        <Segmentado
          opciones={[
            { valor: 'd/m/Y', texto: 'DD/MM/AAAA' },
            { valor: 'm/d/Y', texto: 'MM/DD/AAAA' },
            { valor: 'Y-m-d', texto: 'AAAA-MM-DD' },
          ]}
          valor={formatoBorrador}
          onChange={setFormatoBorrador}
        />
        {borrador.fecha && (
          <Text style={styles.ayudaPequena}>Ejemplo de tu archivo: {(muestras[borrador.fecha] ?? []).join(', ')}</Text>
        )}
      </View>
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    ayuda: { fontSize: 14, color: colores.textoSuave },
    ayudaPequena: { fontSize: 12, color: colores.textoSuave },
    label: { fontSize: 14, fontWeight: '600', color: colores.texto },
    requeridos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    requerido: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radio.sm,
    },
    requeridoTexto: { fontSize: 13, fontWeight: '600' },
    columna: {
      borderWidth: 1.5,
      borderColor: colores.borde,
      borderRadius: radio.md,
      padding: 12,
      gap: 8,
    },
    columnaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    columnaNombre: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: colores.texto },
    columnaAsignada: { fontSize: 14, fontWeight: '700', color: colores.primario },
    ejemplos: {
      fontSize: 13,
      color: colores.textoSuave,
      backgroundColor: colores.superficie,
      borderRadius: radio.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },
    opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    opcion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radio.sm,
      backgroundColor: colores.superficie,
    },
    opcionActiva: { backgroundColor: colores.primario },
    opcionOcupada: { opacity: 0.45 }, // ya asignada a otra columna (se puede reasignar)
    opcionIgnorar: { borderWidth: 1, borderColor: colores.borde },
    opcionTexto: { fontSize: 13, color: colores.texto },
    opcionTextoActivo: { color: '#fff', fontWeight: '700' },
    aviso: { fontSize: 13, color: colores.gasto },
  });

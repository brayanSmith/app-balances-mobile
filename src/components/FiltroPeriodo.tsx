import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Chips, type OpcionChip } from '@/components/Chips';
import { useEstilos, useTema } from '@/context/tema';
import { ayer, desplazar, esFechaValida, hoy } from '@/lib/format';
import { radio, type Paleta } from '@/lib/theme';

export type Periodo = 'todo' | 'hoy' | 'ayer' | 'semana' | 'mes' | 'anio' | 'personalizado';

const TODO: OpcionChip<Periodo> = { valor: 'todo', texto: 'Todo', icono: 'infinite-outline' };

const PERIODOS: OpcionChip<Periodo>[] = [
  { valor: 'hoy', texto: 'Hoy' },
  { valor: 'ayer', texto: 'Ayer' },
  { valor: 'semana', texto: 'Última semana' },
  { valor: 'mes', texto: 'Último mes' },
  { valor: 'anio', texto: 'Último año' },
  { valor: 'personalizado', texto: 'Personalizado', icono: 'calendar-outline' },
];

/** Rango de fechas de cada período, contado hacia atrás desde hoy (incluye hoy). */
export function rangoDePeriodo(periodo: Exclude<Periodo, 'personalizado' | 'todo'>) {
  const h = hoy();
  switch (periodo) {
    case 'hoy':
      return { desde: h, hasta: h };
    case 'ayer':
      return { desde: ayer(), hasta: ayer() };
    case 'semana':
      return { desde: desplazar(h, -6, 'dias'), hasta: h };
    case 'mes':
      return { desde: desplazar(h, -1, 'meses'), hasta: h };
    case 'anio':
      return { desde: desplazar(h, -1, 'anios'), hasta: h };
  }
}

interface Props {
  periodo: Periodo;
  onPeriodo: (periodo: Periodo) => void;
  /** Fechas del período "Personalizado" (AAAA-MM-DD). */
  desde: string;
  hasta: string;
  onDesde: (fecha: string) => void;
  onHasta: (fecha: string) => void;
  /** Agrega "Todo" (sin límite de fechas) al principio. */
  conTodo?: boolean;
}

/** Filtro de tiempo (historial y análisis): períodos rápidos o un rango a mano. */
export function FiltroPeriodo({ periodo, onPeriodo, desde, hasta, onDesde, onHasta, conTodo = false }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <>
      <Chips opciones={conTodo ? [TODO, ...PERIODOS] : PERIODOS} valor={periodo} onChange={onPeriodo} />

      {periodo === 'personalizado' && (
        <View style={styles.personalizado}>
          <CampoFecha etiqueta="Desde" valor={desde} onChange={onDesde} />
          <Ionicons name="arrow-forward" size={18} color={colores.textoSuave} style={{ marginTop: 22 }} />
          <CampoFecha etiqueta="Hasta" valor={hasta} onChange={onHasta} />
        </View>
      )}
    </>
  );
}

function CampoFecha({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      <View style={[styles.campo, !esFechaValida(valor) && { borderColor: colores.gasto }]}>
        <Ionicons name="calendar-outline" size={16} color={colores.textoSuave} />
        <TextInput
          style={styles.campoInput}
          value={valor}
          onChangeText={onChange}
          placeholder="AAAA-MM-DD"
          placeholderTextColor={colores.textoSuave}
          maxLength={10}
        />
      </View>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    personalizado: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    campoEtiqueta: {
      fontSize: 13,
      fontWeight: '600',
      color: colores.textoSuave,
      marginBottom: 6,
    },
    campo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      borderWidth: 1,
      borderColor: colores.borde,
      paddingHorizontal: 12,
    },
    campoInput: {
      flex: 1,
      fontSize: 15,
      color: colores.texto,
      paddingVertical: 10,
    },
  });

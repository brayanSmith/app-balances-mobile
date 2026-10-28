import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CandleStickChart, LineChart, type lineDataItem } from 'react-native-gifted-charts';
import Svg, { Line, Rect } from 'react-native-svg';

import { useEstilos, useTema } from '@/context/tema';
import { formatearFechaCorta, formatearMonto } from '@/lib/format';
import { escalaBonita, montoCorto } from '@/lib/graficos';
import { radio, type Paleta } from '@/lib/theme';
import type { AgrupacionAnalisis, PeriodoAnalisis } from '@/lib/types';

export type TipoGrafico = 'area' | 'velas';
export type SerieArea = 'saldo' | 'movimientos';

interface Props {
  periodos: PeriodoAnalisis[];
  agrupacion: AgrupacionAnalisis;
  tipo: TipoGrafico;
  serie: SerieArea;
}

const ALTO = 200;
const EJE_Y = 48;
const MARGEN_X = 12;
const ESPACIO_MINIMO = 10; // con menos, el gráfico pasa a tener scroll horizontal
// Gastos punteados (daltonismo) y la proyección con puntos más cortos.
const PUNTEADO_GASTOS = [6, 4];
const PUNTEADO_PROYECCION = [2, 5];
const TRANSPARENTE = '66'; // alfa hex de las velas proyectadas

/**
 * Saldo acumulado por semana, quincena, mes o año: como área (saldo, o ingresos y
 * gastos) o como velas (apertura, cierre, máximo y mínimo del saldo). Lo proyectado
 * se ve punteado o más claro. Tocar un período muestra su detalle debajo.
 */
export function GraficoAnalisis({ periodos, agrupacion, tipo, serie }: Props) {
  const styles = useEstilos(crearEstilos);
  const [ancho, setAncho] = useState(0);

  // Por defecto se detalla el último período registrado (no proyectado).
  const ultimoReal = periodos.findLastIndex((p) => !p.proyectado);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const indice = Math.min(seleccion ?? (ultimoReal >= 0 ? ultimoReal : periodos.length - 1), periodos.length - 1);

  if (periodos.length === 0) return null;

  const hayProyeccion = periodos.some((p) => p.proyectado);
  const anchoPlot = Math.max(1, ancho - EJE_Y);
  const n = periodos.length;
  const espacioAjustado = n > 1 ? (anchoPlot - MARGEN_X * 2) / (n - 1) : anchoPlot / 2;
  const espacio = Math.max(ESPACIO_MINIMO, espacioAjustado);
  const conScroll = espacioAjustado < ESPACIO_MINIMO;
  const clave = `${tipo}-${serie}-${agrupacion}-${n}-${periodos[0].desde}`;

  return (
    <View style={styles.tarjeta}>
      <Leyenda tipo={tipo} serie={serie} hayProyeccion={hayProyeccion} />

      <View onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
        {ancho > 0 &&
          (tipo === 'velas' ? (
            <Velas
              key={clave}
              periodos={periodos}
              anchoPlot={anchoPlot}
              espacio={espacio}
              conScroll={conScroll}
              onSeleccion={setSeleccion}
            />
          ) : (
            <Area
              key={clave}
              periodos={periodos}
              serie={serie}
              anchoPlot={anchoPlot}
              espacio={espacio}
              conScroll={conScroll}
              ultimoReal={ultimoReal}
              onSeleccion={setSeleccion}
            />
          ))}
      </View>

      <View style={[styles.ejeX, { marginLeft: EJE_Y }]}>
        <Text style={styles.ejeXTexto}>{etiquetaCorta(periodos[0].desde, agrupacion)}</Text>
        <Text style={styles.ejeXTexto}>{etiquetaCorta(periodos[n - 1].desde, agrupacion)}</Text>
      </View>

      <Detalle periodo={periodos[indice]} agrupacion={agrupacion} />
      <Text style={styles.ayuda}>
        Toca {tipo === 'velas' ? 'una vela' : 'un punto'} para ver el detalle{conScroll ? ' · desliza para ver más' : ''}.
      </Text>
    </View>
  );
}

interface GraficoProps {
  periodos: PeriodoAnalisis[];
  anchoPlot: number;
  espacio: number;
  conScroll: boolean;
  onSeleccion: (indice: number) => void;
}

function Area({
  periodos,
  serie,
  anchoPlot,
  espacio,
  conScroll,
  ultimoReal,
  onSeleccion,
}: GraficoProps & { serie: SerieArea; ultimoReal: number }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  const series =
    serie === 'saldo'
      ? [{ valores: periodos.map((p) => p.cierre), color: colores.primario, punteado: undefined }]
      : [
          { valores: periodos.map((p) => p.ingresos), color: colores.ingreso, punteado: undefined },
          { valores: periodos.map((p) => p.gastos), color: colores.gasto, punteado: PUNTEADO_GASTOS },
        ];

  const todos = series.flatMap((s) => s.valores);
  const escala = escalaBonita(Math.min(0, ...todos), Math.max(0, ...todos));
  const tramosArriba = Math.max(1, Math.round(escala.max / escala.paso));
  const tramosAbajo = Math.max(0, Math.round(-escala.min / escala.paso));
  const altoArriba = (ALTO * tramosArriba) / (tramosArriba + tramosAbajo);

  // La proyección arranca en el último punto registrado y sigue punteada.
  const proyectados =
    ultimoReal >= 0 && ultimoReal < periodos.length - 1
      ? [{ startIndex: ultimoReal, endIndex: periodos.length - 1, strokeDashArray: PUNTEADO_PROYECCION }]
      : undefined;

  const aDatos = (valores: number[], color: string): lineDataItem[] =>
    valores.map((value, i) => ({
      value,
      dataPointColor: periodos[i].proyectado ? colores.tarjeta : color,
      // Línea vertical en "hoy": donde empieza la proyección.
      ...(proyectados &&
        i === ultimoReal && {
          showVerticalLine: true,
          verticalLineColor: colores.textoSuave,
          verticalLineStrokeDashArray: [3, 3],
          verticalLineThickness: 1,
        }),
    }));

  const [primera, segunda] = series;

  return (
    <LineChart
      data={aDatos(primera.valores, primera.color)}
      data2={segunda ? aDatos(segunda.valores, segunda.color) : undefined}
      color1={primera.color}
      color2={segunda?.color}
      thickness={2}
      strokeDashArray2={segunda?.punteado}
      lineSegments={proyectados}
      lineSegments2={segunda ? proyectados : undefined}
      hideDataPoints={periodos.length > 24}
      dataPointsRadius={3}
      dataPointsColor1={primera.color}
      dataPointsColor2={segunda?.color}
      areaChart
      startFillColor1={primera.color}
      endFillColor1={primera.color}
      startFillColor2={segunda?.color}
      endFillColor2={segunda?.color}
      startOpacity={0.3}
      endOpacity={0.02}
      curved
      curvature={0.15}
      isAnimated
      animationDuration={800}
      animateTogether
      width={anchoPlot}
      height={altoArriba}
      initialSpacing={MARGEN_X}
      endSpacing={MARGEN_X}
      spacing={espacio}
      disableScroll={!conScroll}
      scrollToEnd={conScroll}
      maxValue={escala.max}
      stepValue={escala.paso}
      noOfSections={tramosArriba}
      mostNegativeValue={escala.min < 0 ? escala.min : undefined}
      noOfSectionsBelowXAxis={tramosAbajo}
      formatYLabel={(etiqueta) => montoCorto(Number(etiqueta))}
      yAxisLabelWidth={EJE_Y}
      yAxisTextStyle={styles.ejeY}
      yAxisColor="transparent"
      yAxisThickness={0}
      xAxisColor={colores.borde}
      xAxisThickness={1}
      rulesColor={colores.borde}
      rulesType="dashed"
      dashWidth={2}
      dashGap={4}
      xAxisLabelsHeight={0}
      focusEnabled
      showStripOnFocus
      showDataPointOnFocus
      stripColor={colores.textoSuave}
      stripOpacity={0.5}
      stripWidth={1}
      onFocus={(_item: lineDataItem, i: number) => onSeleccion(i)}
    />
  );
}

function Velas({ periodos, anchoPlot, espacio, conScroll, onSeleccion }: GraficoProps) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  // La librería no dibuja bien velas bajo cero: todo se corre para que el mínimo
  // del eje quede en 0 y las etiquetas le vuelven a sumar ese desplazamiento.
  const escala = escalaBonita(
    Math.min(...periodos.map((p) => p.minimo)),
    Math.max(...periodos.map((p) => p.maximo)),
  );
  const base = escala.min;
  const ancho = Math.max(3, Math.min(22, espacio * 0.6));

  const datos = periodos.map((p) => {
    const sube = p.cierre >= p.apertura;
    const color = (sube ? colores.ingreso : colores.gasto) + (p.proyectado ? TRANSPARENTE : '');
    return {
      open: p.apertura - base,
      close: p.cierre - base,
      high: p.maximo - base,
      low: p.minimo - base,
      color,
      barBorderColor: color,
      verticalLineColor: color,
    };
  });

  return (
    <CandleStickChart
      data={datos}
      width={anchoPlot}
      height={ALTO}
      parentWidth={anchoPlot}
      barWidth={ancho}
      spacing={espacio - ancho}
      initialSpacing={MARGEN_X}
      endSpacing={MARGEN_X}
      disableScroll={!conScroll}
      scrollToEnd={conScroll}
      maxValue={escala.max - base}
      stepValue={escala.paso}
      noOfSections={Math.max(1, Math.round((escala.max - base) / escala.paso))}
      formatYLabel={(etiqueta) => montoCorto(Number(etiqueta) + base)}
      yAxisLabelWidth={EJE_Y}
      yAxisTextStyle={styles.ejeY}
      yAxisColor="transparent"
      yAxisThickness={0}
      xAxisColor={colores.borde}
      xAxisThickness={1}
      rulesColor={colores.borde}
      rulesType="dashed"
      dashWidth={2}
      dashGap={4}
      xAxisLabelsHeight={0}
      onPress={(_item: unknown, i: number) => onSeleccion(i)}
    />
  );
}

function Leyenda({ tipo, serie, hayProyeccion }: { tipo: TipoGrafico; serie: SerieArea; hayProyeccion: boolean }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  const items =
    tipo === 'velas'
      ? [
          { nombre: 'Subió el saldo', color: colores.ingreso, vela: true },
          { nombre: 'Bajó el saldo', color: colores.gasto, vela: true },
        ]
      : serie === 'saldo'
        ? [{ nombre: 'Saldo acumulado', color: colores.primario }]
        : [
            { nombre: 'Ingresos', color: colores.ingreso },
            { nombre: 'Gastos', color: colores.gasto, punteado: '4 3' },
          ];

  return (
    <View style={styles.leyenda}>
      {items.map((s) => (
        <View key={s.nombre} style={styles.leyendaItem}>
          <Svg width={18} height={12}>
            {'vela' in s ? (
              <>
                <Line x1={9} x2={9} y1={0} y2={12} stroke={s.color} strokeWidth={1.5} />
                <Rect x={5} y={3} width={8} height={6} fill={s.color} />
              </>
            ) : (
              <Line
                x1={1}
                x2={17}
                y1={6}
                y2={6}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={'punteado' in s ? s.punteado : undefined}
                strokeLinecap="round"
              />
            )}
          </Svg>
          <Text style={styles.leyendaTexto}>{s.nombre}</Text>
        </View>
      ))}
      {hayProyeccion && (
        <View style={styles.leyendaItem}>
          <Svg width={18} height={12}>
            {tipo === 'velas' ? (
              <Rect x={5} y={3} width={8} height={6} fill={colores.textoSuave + TRANSPARENTE} />
            ) : (
              <Line x1={1} x2={17} y1={6} y2={6} stroke={colores.textoSuave} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
            )}
          </Svg>
          <Text style={styles.leyendaTexto}>Proyección</Text>
        </View>
      )}
    </View>
  );
}

function Detalle({ periodo, agrupacion }: { periodo: PeriodoAnalisis; agrupacion: AgrupacionAnalisis }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const variacion = periodo.cierre - periodo.apertura;

  const filas: [string, number, string?][] = [
    ['Ingresos', periodo.ingresos, colores.ingreso],
    ['Gastos', periodo.gastos, colores.gasto],
    ['Saldo al empezar', periodo.apertura],
    ['Saldo al terminar', periodo.cierre],
    ['Saldo más alto', periodo.maximo],
    ['Saldo más bajo', periodo.minimo],
  ];

  return (
    <View style={styles.detalle}>
      <View style={styles.detalleCabecera}>
        <Text style={styles.detalleTitulo}>{titulo(periodo, agrupacion)}</Text>
        {periodo.proyectado && <Text style={styles.etiquetaProyeccion}>Proyección</Text>}
      </View>
      <Text style={[styles.variacion, { color: variacion < 0 ? colores.gasto : colores.ingreso }]}>
        {variacion < 0 ? '▼ ' : '▲ '}
        {formatearMonto(Math.abs(variacion))} en el período
      </Text>
      <View style={styles.detalleGrilla}>
        {filas.map(([nombre, valor, color]) => (
          <View key={nombre} style={styles.detalleCelda}>
            <Text style={styles.detalleNombre}>{nombre}</Text>
            <Text style={[styles.detalleValor, color && { color }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatearMonto(valor)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Eje X: "5 oct", "oct 26", "2026". */
function etiquetaCorta(fecha: string, agrupacion: AgrupacionAnalisis) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (agrupacion === 'anio') return String(anio);
  if (agrupacion === 'mes') return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
  return `${dia} ${MESES[mes - 1]} ${String(anio).slice(2)}`;
}

/** "Semana del 5 oct 2026", "1.ª quincena de octubre 2026", "Octubre 2026", "Año 2026". */
function titulo({ desde, hasta }: PeriodoAnalisis, agrupacion: AgrupacionAnalisis) {
  const [anio, mes, dia] = desde.split('-').map(Number);
  switch (agrupacion) {
    case 'anio':
      return `Año ${anio}`;
    case 'mes':
      return `${MESES_LARGOS[mes - 1]} ${anio}`;
    case 'quincena':
      return `${dia <= 15 ? '1.ª' : '2.ª'} quincena de ${MESES_LARGOS[mes - 1].toLowerCase()} ${anio}`;
    case 'semana':
      return `${formatearFechaCorta(desde)} – ${formatearFechaCorta(hasta)}`;
  }
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    tarjeta: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      padding: 16,
      gap: 12,
      boxShadow: colores.sombra,
      overflow: 'hidden',
    },
    leyenda: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
    leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    leyendaTexto: { fontSize: 12, fontWeight: '600', color: colores.texto },
    ejeY: { fontSize: 10, color: colores.textoSuave },
    ejeX: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
    ejeXTexto: { fontSize: 11, color: colores.textoSuave },
    ayuda: { fontSize: 12, color: colores.textoSuave, textAlign: 'center' },
    detalle: { backgroundColor: colores.superficie, borderRadius: radio.md, padding: 12, gap: 8 },
    detalleCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    detalleTitulo: { flex: 1, fontSize: 14, fontWeight: '700', color: colores.texto },
    etiquetaProyeccion: {
      fontSize: 11,
      fontWeight: '700',
      color: colores.aviso,
      backgroundColor: colores.avisoSuave,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radio.sm,
      overflow: 'hidden',
    },
    variacion: { fontSize: 13, fontWeight: '700' },
    detalleGrilla: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
    detalleCelda: { width: '50%', paddingRight: 8 },
    detalleNombre: { fontSize: 12, color: colores.textoSuave },
    detalleValor: { fontSize: 14, fontWeight: '700', color: colores.texto },
  });

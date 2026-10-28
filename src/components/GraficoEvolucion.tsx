import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart, type lineDataItem } from 'react-native-gifted-charts';
import Svg, { Line } from 'react-native-svg';

import { Segmentado } from '@/components/Segmentado';
import { useEstilos, useTema } from '@/context/tema';
import { formatearFechaCorta, formatearMonto } from '@/lib/format';
import { escalaBonita, montoCorto } from '@/lib/graficos';
import { radio, type Paleta } from '@/lib/theme';
import type { Evolucion, TipoMovimiento } from '@/lib/types';

interface Props {
  evolucion: Evolucion;
  /** Filtro de tipo del historial: con uno solo se dibuja solo esa línea. */
  tipo: 'todos' | TipoMovimiento;
}

type Vista = 'movimientos' | 'balance';

interface Serie {
  nombre: string;
  valores: number[];
  color: string;
  punteado: boolean;
}

const ALTO = 160;
const EJE_Y = 44; // ancho de las etiquetas de montos
const MARGEN_X = 10; // aire a los lados para que el primer y último punto no se corten
const ANCHO_DETALLE = 170;
const ANCHO_ETIQUETA = 56; // fechas del eje X: más anchas que el espacio entre puntos
// Rojo y verde se confunden con daltonismo: los gastos van además punteados.
const PUNTEADO = [6, 4];

/**
 * Ingresos y gastos del período en el tiempo (o el balance acumulado), con
 * react-native-gifted-charts. Tocar o arrastrar muestra el detalle de ese día, semana o mes.
 */
export function GraficoEvolucion({ evolucion, tipo }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const [ancho, setAncho] = useState(0);
  const [vista, setVista] = useState<Vista>('movimientos');

  const { puntos, agrupacion } = evolucion;
  if (puntos.length < 2) return null; // "Hoy" y "Ayer": un solo punto no es una tendencia

  let acumulado = 0;
  const balance = puntos.map((p) => (acumulado += p.ingresos - p.gastos));

  const series: Serie[] =
    vista === 'balance'
      ? [{ nombre: 'Balance', valores: balance, color: colores.primario, punteado: false }]
      : [
          ...(tipo !== 'gasto'
            ? [{ nombre: 'Ingresos', valores: puntos.map((p) => p.ingresos), color: colores.ingreso, punteado: false }]
            : []),
          ...(tipo !== 'ingreso'
            ? [{ nombre: 'Gastos', valores: puntos.map((p) => p.gastos), color: colores.gasto, punteado: true }]
            : []),
        ];

  const sinDatos = puntos.every((p) => p.ingresos === 0 && p.gastos === 0);
  const todos = series.flatMap((s) => s.valores);
  const escala = escalaBonita(Math.min(0, ...todos), Math.max(0, ...todos));

  const anchoPlot = Math.max(1, ancho - EJE_Y);
  const espacio = (anchoPlot - MARGEN_X * 2) / (puntos.length - 1);
  // El alto total es fijo: se reparte entre la parte positiva y la negativa del eje Y
  // (la librería, si no, suma cada tramo bajo cero como alto extra).
  const tramosArriba = Math.max(1, Math.round(escala.max / escala.paso));
  const tramosAbajo = Math.max(0, Math.round(-escala.min / escala.paso));
  const altoArriba = (ALTO * tramosArriba) / (tramosArriba + tramosAbajo);

  // Solo tres fechas en el eje X (inicio, mitad y fin) para que no se amontonen.
  const conEtiqueta = new Set([0, Math.floor((puntos.length - 1) / 2), puntos.length - 1]);
  const aDatos = (valores: number[]): lineDataItem[] =>
    valores.map((value, i) => ({
      value,
      labelComponent: conEtiqueta.has(i)
        ? () => (
            <Text
              style={[
                styles.ejeX,
                // La primera y la última se alinean hacia adentro para que no se corten.
                // (la librería pone cada etiqueta en una caja que empieza medio espacio antes del punto).
                { marginLeft: espacio / 2 - ANCHO_ETIQUETA / 2 },
                i === 0 && { marginLeft: espacio / 2 - MARGEN_X, textAlign: 'left' },
                i === puntos.length - 1 && {
                  marginLeft: espacio / 2 + MARGEN_X - ANCHO_ETIQUETA,
                  textAlign: 'right',
                },
              ]}
            >
              {etiquetaPunto(puntos[i].desde, agrupacion)}
            </Text>
          )
        : undefined,
    }));

  const [primera, segunda] = series;

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>Evolución {TEXTO_AGRUPACION[agrupacion]}</Text>

      <Segmentado
        opciones={[
          {
            valor: 'movimientos',
            texto: tipo === 'todos' ? 'Ingresos y gastos' : tipo === 'ingreso' ? 'Ingresos' : 'Gastos',
          },
          { valor: 'balance', texto: 'Balance' },
        ]}
        valor={vista}
        onChange={setVista}
      />

      {/* Leyenda: siempre con nombre, nunca solo el color. */}
      <View style={styles.leyenda}>
        {series.map((s) => (
          <View key={s.nombre} style={styles.leyendaItem}>
            <Svg width={18} height={8}>
              <Line
                x1={1}
                x2={17}
                y1={4}
                y2={4}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.punteado ? '4 3' : undefined}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={styles.leyendaTexto}>{s.nombre}</Text>
          </View>
        ))}
        {vista === 'balance' && <Text style={styles.leyendaNota}>acumulado: ingresos − gastos</Text>}
      </View>

      {sinDatos ? (
        <Text style={styles.vacio}>No hay movimientos en este período.</Text>
      ) : (
        <View onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
          {ancho > 0 && (
            <LineChart
              // Se rearma al cambiar de vista o de filtro (la librería guarda estado interno del puntero).
              key={`${vista}-${tipo}-${puntos.length}-${puntos[0].desde}`}
              data={aDatos(primera.valores)}
              data2={segunda ? aDatos(segunda.valores) : undefined}
              color1={primera.color}
              color2={segunda?.color}
              thickness={2}
              strokeDashArray1={primera.punteado ? PUNTEADO : undefined}
              strokeDashArray2={segunda?.punteado ? PUNTEADO : undefined}
              // Puntos solo si son pocos; con muchos parecería un collar.
              hideDataPoints={puntos.length > 14}
              dataPointsRadius={3}
              dataPointsColor1={primera.color}
              dataPointsColor2={segunda?.color}
              // Áreas con degradado hacia abajo, una por serie y del color de su línea.
              areaChart
              startFillColor1={primera.color}
              endFillColor1={primera.color}
              startFillColor2={segunda?.color}
              endFillColor2={segunda?.color}
              startOpacity={0.3}
              endOpacity={0.02}
              curved
              curvature={0.15} // poca curvatura: con más, la línea "rebota" bajo el 0 en picos
              // Se dibuja al aparecer (también al cambiar de vista o filtro, porque se rearma)
              // y se transforma suavemente cuando llegan datos nuevos.
              isAnimated
              animationDuration={900}
              animateTogether // ingresos y gastos entran a la vez
              animateOnDataChange
              onDataChangeAnimationDuration={500}
              // Medidas: ocupa todo el ancho, sin scroll.
              width={anchoPlot}
              height={altoArriba}
              initialSpacing={MARGEN_X}
              endSpacing={MARGEN_X}
              spacing={espacio}
              disableScroll
              // Eje Y con montos redondos (0, 500 k, 1 M…) y, en el balance, valores negativos.
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
              // Detalle al tocar o arrastrar.
              pointerConfig={{
                pointerStripColor: colores.textoSuave,
                pointerStripWidth: 1,
                pointerStripUptoDataPoint: false,
                pointerColor: colores.texto,
                pointer1Color: primera.color,
                pointer2Color: segunda?.color,
                radius: 5,
                persistPointer: true, // en web se ve con un clic y queda visible
                activatePointersInstantlyOnTouch: true,
                autoAdjustPointerLabelPosition: true,
                pointerLabelWidth: ANCHO_DETALLE,
                pointerLabelHeight: 30 + series.length * 22,
                shiftPointerLabelY: 4,
                pointerLabelComponent: (_items: lineDataItem[], _sec: unknown, indice: number) => (
                  <View style={styles.detalle}>
                    <Text style={styles.detalleTitulo}>{etiquetaDetalle(puntos[indice].desde, agrupacion)}</Text>
                    {series.map((s) => (
                      <View key={`det-${s.nombre}`} style={styles.detalleFila}>
                        <View style={[styles.detallePunto, { backgroundColor: s.color }]} />
                        <Text style={styles.detalleNombre}>{s.nombre}</Text>
                        <Text style={styles.detalleValor}>{formatearMonto(s.valores[indice])}</Text>
                      </View>
                    ))}
                  </View>
                ),
              }}
            />
          )}
        </View>
      )}

      {!sinDatos && <Text style={styles.ayuda}>Toca o arrastra sobre el gráfico para ver el detalle.</Text>}
    </View>
  );
}

const TEXTO_AGRUPACION: Record<Evolucion['agrupacion'], string> = {
  dia: 'por día',
  semana: 'por semana',
  mes: 'por mes',
  anio: 'por año',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Etiqueta corta del eje X: "27 oct", "oct 26", "2026". */
function etiquetaPunto(fecha: string, agrupacion: Evolucion['agrupacion']) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (agrupacion === 'anio') return String(anio);
  if (agrupacion === 'mes') return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
  return `${dia} ${MESES[mes - 1]}`;
}

/** Título del detalle: "27 oct 2026", "Semana del 1 sep 2026", "Octubre 2026". */
function etiquetaDetalle(fecha: string, agrupacion: Evolucion['agrupacion']) {
  const [anio, mes] = fecha.split('-').map(Number);
  if (agrupacion === 'anio') return `Año ${anio}`;
  if (agrupacion === 'mes') return `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} ${anio}`;
  if (agrupacion === 'semana') return `Semana del ${formatearFechaCorta(fecha)}`;
  return formatearFechaCorta(fecha);
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
    titulo: { fontSize: 15, fontWeight: '700', color: colores.texto },
    leyenda: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
    leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    leyendaTexto: { fontSize: 12, fontWeight: '600', color: colores.texto },
    leyendaNota: { fontSize: 12, color: colores.textoSuave },
    ejeY: { fontSize: 10, color: colores.textoSuave },
    // Más ancha que el espacio entre puntos y centrada en el suyo.
    ejeX: {
      width: ANCHO_ETIQUETA,
      textAlign: 'center',
      fontSize: 10,
      color: colores.textoSuave,
    },
    vacio: { fontSize: 13, color: colores.textoSuave, textAlign: 'center', paddingVertical: 24 },
    ayuda: { fontSize: 12, color: colores.textoSuave, textAlign: 'center' },
    detalle: {
      width: ANCHO_DETALLE,
      backgroundColor: colores.tarjeta,
      borderColor: colores.borde,
      borderWidth: 1,
      borderRadius: radio.md,
      padding: 8,
      gap: 4,
      boxShadow: colores.sombra,
    },
    detalleTitulo: { fontSize: 12, fontWeight: '700', color: colores.texto },
    detalleFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detallePunto: { width: 8, height: 8, borderRadius: 4 },
    detalleNombre: { flex: 1, fontSize: 12, color: colores.textoSuave },
    detalleValor: { fontSize: 12, fontWeight: '700', color: colores.texto },
  });

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, type OpcionChip } from '@/components/Chips';
import { EstadoConexion } from '@/components/EstadoConexion';
import { FiltroPeriodo, rangoDePeriodo, type Periodo } from '@/components/FiltroPeriodo';
import { GraficoAnalisis, type SerieArea, type TipoGrafico } from '@/components/GraficoAnalisis';
import { Segmentado } from '@/components/Segmentado';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError } from '@/lib/api';
import { analisisDb } from '@/lib/db/analisis';
import { useConsulta } from '@/lib/db/useConsulta';
import { claveMes, desplazar, esFechaValida, formatearFechaCorta, formatearMonto, hoy, nombreMes } from '@/lib/format';
import { radio, type Paleta } from '@/lib/theme';
import type { AgrupacionAnalisis, Analisis } from '@/lib/types';

const MESES_PROYECCION = 12;

/** "Sin proyección" y los próximos meses (incluido el actual: proyecta hasta su cierre). */
function opcionesProyeccion(): OpcionChip<string>[] {
  const ahora = new Date();
  const meses = Array.from({ length: MESES_PROYECCION + 1 }, (_, i) => {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() + i, 1);
    return { valor: claveMes(fecha), texto: nombreMes(fecha) };
  });
  return [{ valor: 'no', texto: 'Sin proyección' }, ...meses];
}

/** Agrupación que se ve bien según el largo del período. */
function agrupacionSugerida(desde: string, hasta: string): AgrupacionAnalisis {
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (dias <= 45) return 'semana';
  if (dias <= 120) return 'quincena';
  if (dias <= 366 * 3) return 'mes';
  return 'anio';
}

export default function AnalisisScreen() {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { sincronizar } = useSincronizacion();

  const [periodo, setPeriodo] = useState<Periodo>('anio');
  const [desdePersonalizado, setDesdePersonalizado] = useState(() => desplazar(hoy(), -1, 'anios'));
  const [hastaPersonalizado, setHastaPersonalizado] = useState(hoy);
  // null: la sugerida para el período; se fija cuando la persona elige una.
  const [agrupacionElegida, setAgrupacion] = useState<AgrupacionAnalisis | null>(null);
  const [proyectar, setProyectar] = useState('no');
  const [tipo, setTipo] = useState<TipoGrafico>('area');
  const [serie, setSerie] = useState<SerieArea>('saldo');

  const [refrescando, setRefrescando] = useState(false);
  const [proyecciones] = useState(opcionesProyeccion);

  // "Todo" no se ofrece aquí (el análisis necesita una fecha de inicio).
  const rango = periodo === 'personalizado' || periodo === 'todo' ? null : rangoDePeriodo(periodo);
  const desde = rango?.desde ?? desdePersonalizado;
  const hasta = rango?.hasta ?? hastaPersonalizado;
  const fechasValidas = esFechaValida(desde) && esFechaValida(hasta) && desde <= hasta;
  const agrupacion = agrupacionElegida ?? (fechasValidas ? agrupacionSugerida(desde, hasta) : 'mes');
  // Solo se proyecta si el período llega hasta hoy (si no, quedaría un hueco).
  const puedeProyectar = hasta >= hoy();
  const proyectarHasta = puedeProyectar && proyectar !== 'no' ? proyectar : undefined;

  // De la base local: se recalcula solo cuando cambia algún movimiento o programado.
  const consulta = useConsulta(
    () =>
      fechasValidas
        ? analisisDb.obtener({ desde, hasta, agrupacion, proyectar_hasta: proyectarHasta })
        : Promise.resolve(null),
    ['movimientos', 'programaciones'],
    [desde, hasta, agrupacion, proyectarHasta, fechasValidas],
  );
  const analisis = consulta.datos ?? null;
  const cargando = consulta.cargando;
  const error = consulta.error ? mensajeDeError(consulta.error) : null;

  // Deslizar hacia abajo: trae lo registrado desde otros dispositivos.
  async function refrescar() {
    setRefrescando(true);
    await sincronizar();
    setRefrescando(false);
  }

  const variacion = analisis ? analisis.saldo_actual - analisis.saldo_inicial : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primario} />}
    >
      <EstadoConexion />

      <Seccion titulo="Período">
        <FiltroPeriodo
          periodo={periodo}
          onPeriodo={setPeriodo}
          desde={desdePersonalizado}
          hasta={hastaPersonalizado}
          onDesde={setDesdePersonalizado}
          onHasta={setHastaPersonalizado}
        />
      </Seccion>

      <Seccion titulo="Proyectar hasta">
        {puedeProyectar ? (
          <Chips opciones={proyecciones} valor={proyectar} onChange={setProyectar} />
        ) : (
          <Text style={styles.nota}>
            Para proyectar, el período tiene que llegar hasta hoy.
          </Text>
        )}
      </Seccion>

      <Seccion titulo="Agrupar por">
        <Segmentado
          opciones={[
            { valor: 'semana', texto: 'Semana' },
            { valor: 'quincena', texto: 'Quincena' },
            { valor: 'mes', texto: 'Mes' },
            { valor: 'anio', texto: 'Año' },
          ]}
          valor={agrupacion}
          onChange={setAgrupacion}
        />
      </Seccion>

      <View style={styles.fila}>
        <View style={{ flex: 1 }}>
          <Segmentado
            opciones={[
              { valor: 'area', texto: 'Área', icono: 'analytics-outline' },
              { valor: 'velas', texto: 'Velas', icono: 'bar-chart-outline' },
            ]}
            valor={tipo}
            onChange={setTipo}
          />
        </View>
      </View>
      {tipo === 'area' && (
        <Segmentado
          opciones={[
            { valor: 'saldo', texto: 'Saldo' },
            { valor: 'movimientos', texto: 'Ingresos y gastos' },
          ]}
          valor={serie}
          onChange={setSerie}
        />
      )}

      {!fechasValidas ? (
        <Text style={styles.error}>Revisa las fechas: usa AAAA-MM-DD y que «desde» no sea posterior a «hasta».</Text>
      ) : cargando && !analisis ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colores.primario} />
      ) : error && !analisis ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        analisis && (
          <>
            <View style={styles.resumen}>
              <Text style={styles.rango}>
                {formatearFechaCorta(desde)} – {formatearFechaCorta(hasta)}
              </Text>
              <View style={styles.cifras}>
                <Cifra texto="Saldo al inicio" valor={analisis.saldo_inicial} />
                <View style={styles.separador} />
                <Cifra texto="Saldo hoy" valor={analisis.saldo_actual} />
                <View style={styles.separador} />
                <Cifra
                  texto="Variación"
                  valor={variacion}
                  color={variacion < 0 ? colores.gasto : colores.ingreso}
                  signo
                />
              </View>
            </View>

            <View style={{ opacity: cargando ? 0.5 : 1 }}>
              <GraficoAnalisis
                // Con otros filtros se vuelve a detallar el último período.
                key={`${analisis.agrupacion}-${analisis.periodos.length}-${analisis.periodos[0]?.desde}`}
                periodos={analisis.periodos}
                agrupacion={analisis.agrupacion}
                tipo={tipo}
                serie={serie}
              />
            </View>

            {analisis.proyeccion && <TarjetaProyeccion analisis={analisis} />}
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )
      )}
    </ScrollView>
  );
}

function TarjetaProyeccion({ analisis }: { analisis: Analisis }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const p = analisis.proyeccion!;
  const cambio = p.saldo_final - analisis.saldo_actual;

  return (
    <View style={styles.proyeccion}>
      <View style={styles.proyeccionCabecera}>
        <Ionicons name="telescope-outline" size={20} color={colores.aviso} />
        <Text style={styles.proyeccionTitulo}>Saldo estimado al {formatearFechaCorta(p.hasta)}</Text>
      </View>
      <Text style={[styles.proyeccionMonto, { color: p.saldo_final < 0 ? colores.gasto : colores.texto }]}>
        {formatearMonto(p.saldo_final)}
      </Text>
      <Text style={[styles.proyeccionCambio, { color: cambio < 0 ? colores.gasto : colores.ingreso }]}>
        {cambio < 0 ? '▼ ' : '▲ '}
        {formatearMonto(Math.abs(cambio))} desde hoy
      </Text>

      <View style={styles.proyeccionDesglose}>
        <Fila
          icono="repeat"
          texto={`Programados (${p.programados.vencimientos} ${p.programados.vencimientos === 1 ? 'vencimiento' : 'vencimientos'})`}
          ingresos={p.programados.ingresos}
          gastos={p.programados.gastos}
        />
        <Fila
          icono="stats-chart-outline"
          texto="Lo demás, al ritmo de tu promedio diario"
          ingresos={p.ingresos - p.programados.ingresos}
          gastos={p.gastos - p.programados.gastos}
        />
      </View>

      <Text style={styles.nota}>
        Se usan las fechas y montos de tus pagos e ingresos programados (los vencidos se cuentan para mañana) más
        el promedio de lo no programado en el período elegido ({p.dias_base} {p.dias_base === 1 ? 'día' : 'días'}:{' '}
        {formatearMonto(p.promedio_diario.ingresos)} de ingresos y {formatearMonto(p.promedio_diario.gastos)} de gastos
        por día). Es una estimación: elige un período largo para que sea más fiable.
      </Text>
    </View>
  );
}

function Fila({
  icono,
  texto,
  ingresos,
  gastos,
}: {
  icono: React.ComponentProps<typeof Ionicons>['name'];
  texto: string;
  ingresos: number;
  gastos: number;
}) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.filaTitulo}>
        <Ionicons name={icono} size={15} color={colores.textoSuave} />
        <Text style={styles.filaTexto}>{texto}</Text>
      </View>
      <View style={styles.filaMontos}>
        <Text style={[styles.filaMonto, { color: colores.ingreso }]}>+ {formatearMonto(ingresos)}</Text>
        <Text style={[styles.filaMonto, { color: colores.gasto }]}>− {formatearMonto(gastos)}</Text>
      </View>
    </View>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.seccionTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

function Cifra({ texto, valor, color, signo = false }: { texto: string; valor: number; color?: string; signo?: boolean }) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.cifra}>
      <Text style={styles.cifraTexto}>{texto}</Text>
      <Text style={[styles.cifraValor, color && { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {signo && valor > 0 ? '+' : ''}
        {formatearMonto(valor)}
      </Text>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colores.fondo },
    contenido: { padding: 16, paddingBottom: 48, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
    seccionTitulo: { fontSize: 13, fontWeight: '700', color: colores.textoSuave, textTransform: 'uppercase' },
    fila: { flexDirection: 'row', gap: 10 },
    nota: { fontSize: 12, color: colores.textoSuave, lineHeight: 17 },
    error: { color: colores.gasto },
    resumen: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      padding: 16,
      gap: 12,
      boxShadow: colores.sombra,
    },
    rango: { fontSize: 13, fontWeight: '600', color: colores.textoSuave, textAlign: 'center' },
    cifras: { flexDirection: 'row', alignItems: 'center' },
    cifra: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
    cifraTexto: { fontSize: 12, color: colores.textoSuave },
    cifraValor: { fontSize: 16, fontWeight: '800', color: colores.texto },
    separador: { width: 1, height: 32, backgroundColor: colores.borde },
    proyeccion: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      borderWidth: 1.5,
      borderColor: colores.aviso,
      borderStyle: 'dashed',
      padding: 16,
      gap: 8,
    },
    proyeccionCabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proyeccionTitulo: { flex: 1, fontSize: 15, fontWeight: '700', color: colores.texto },
    proyeccionMonto: { fontSize: 28, fontWeight: '800' },
    proyeccionCambio: { fontSize: 14, fontWeight: '700' },
    proyeccionDesglose: {
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      padding: 12,
      gap: 12,
      marginVertical: 4,
    },
    filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    filaTexto: { flex: 1, fontSize: 13, color: colores.texto, fontWeight: '600' },
    filaMontos: { flexDirection: 'row', gap: 16, paddingLeft: 21 },
    filaMonto: { fontSize: 14, fontWeight: '700' },
  });

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EstadoConexion } from '@/components/EstadoConexion';
import {
  agruparPorDiaConTotales,
  EncabezadoDia,
  FilaGrupo,
  FilaMovimiento,
  type Grupo,
} from '@/components/FilaMovimiento';
import { FiltroPeriodo, rangoDePeriodo, type Periodo } from '@/components/FiltroPeriodo';
import { GraficoEvolucion } from '@/components/GraficoEvolucion';
import { MovimientoSheet } from '@/components/MovimientoSheet';
import { Segmentado, type OpcionSegmentado } from '@/components/Segmentado';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError, movimientosApi } from '@/lib/api';
import { desplazar, esFechaValida, formatearFechaCorta, formatearMonto, hoy } from '@/lib/format';
import { evolucion as calcularEvolucion, filtrar, totales, type FiltrosHistorial } from '@/lib/historial';
import { conCache } from '@/lib/offline';
import { radio, type Paleta } from '@/lib/theme';
import type { Evolucion, Movimiento, TipoMovimiento } from '@/lib/types';

type Agrupacion = Evolucion['agrupacion'];

interface EstadoSheet {
  abierto: boolean;
  id: number | null;
  clave: number;
}

export default function HistorialScreen() {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desdePersonalizado, setDesdePersonalizado] = useState(() => desplazar(hoy(), -1, 'meses'));
  const [hastaPersonalizado, setHastaPersonalizado] = useState(hoy);
  const [tipo, setTipo] = useState<'todos' | TipoMovimiento>('todos');
  // null: la API elige según el largo del período (en "Todo", por mes).
  const [agrupacionElegida, setAgrupacion] = useState<Agrupacion | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState(''); // la búsqueda se aplica cuando se deja de escribir

  // Todos los movimientos: se piden una vez y los filtros se aplican aquí.
  const [todos, setTodos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<number | null>(null);
  const { version } = useSincronizacion();
  const [sheet, setSheet] = useState<EstadoSheet>({
    abierto: false,
    id: null,
    clave: 0,
  });
  // Si llega una respuesta vieja después de una más nueva, se descarta.
  const peticion = useRef(0);

  // Buscar ya no pide nada al servidor: solo una pausa corta para no filtrar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 150);
    return () => clearTimeout(t);
  }, [busqueda]);

  // "Todo": sin fecha de inicio (la API arranca en el primer movimiento) y el gráfico por mes.
  const esTodo = periodo === 'todo';
  const rango = periodo === 'personalizado' || esTodo ? null : rangoDePeriodo(periodo);
  const desde = esTodo ? undefined : (rango?.desde ?? desdePersonalizado);
  const hasta = rango?.hasta ?? (esTodo ? hoy() : hastaPersonalizado);
  const fechasValidas =
    desde === undefined || (esFechaValida(desde) && esFechaValida(hasta) && desde <= hasta);

  const filtros = useMemo<FiltrosHistorial>(
    () => ({ desde, hasta, tipo: tipo === 'todos' ? undefined : tipo, q: q || undefined }),
    [desde, hasta, tipo, q],
  );

  // Por día solo en períodos de hasta un año (si no, serían miles de puntos).
  const diasDelRango = desde === undefined ? Infinity : (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  const agrupaciones: OpcionSegmentado<Agrupacion>[] = [
    ...(diasDelRango <= 366 ? [{ valor: 'dia' as const, texto: 'Día' }] : []),
    { valor: 'semana', texto: 'Semana' },
    { valor: 'mes', texto: 'Mes' },
    { valor: 'anio', texto: 'Año' },
  ];

  function cambiarPeriodo(nuevo: Periodo) {
    setPeriodo(nuevo);
    setAgrupacion(null); // cada período arranca con la agrupación que mejor le queda
  }

  /**
   * Una sola petición con todos los movimientos. Al volver a la pantalla se usa lo
   * que está en memoria; solo se pide de nuevo si algo cambió (crear, editar,
   * borrar, sincronizar), pasados 10 minutos o al deslizar para recargar (forzar).
   */
  const cargar = useCallback(
    async (forzar = false) => {
      const n = ++peticion.current;
      setError(null);
      try {
        const r = await conCache('historial:todos', () => movimientosApi.listar({}), { forzar });
        if (n !== peticion.current) return;
        setTodos(r.datos);
        setGuardadoEn(r.guardadoEn);
      } catch (e) {
        if (n === peticion.current) setError(mensajeDeError(e));
      } finally {
        if (n === peticion.current) setCargando(false);
      }
      // "version" cambia al enviar lo que estaba en cola o al volver la conexión.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  async function refrescar() {
    setRefrescando(true);
    await cargar(true);
    setRefrescando(false);
  }

  // Todo lo que sigue se calcula en el teléfono, sin peticiones.
  const movimientos = useMemo(() => (fechasValidas ? filtrar(todos, filtros) : []), [todos, filtros, fechasValidas]);
  const resumen = useMemo(() => totales(movimientos), [movimientos]);
  const evolucion = useMemo(
    () =>
      fechasValidas
        ? calcularEvolucion(movimientos, filtros, agrupacionElegida ?? (esTodo ? 'mes' : undefined))
        : null,
    [movimientos, filtros, agrupacionElegida, esTodo, fechasValidas],
  );
  const total = movimientos.length;
  // Por semana, mes o año la lista es de totales por grupo, no de movimientos.
  const agrupado = !!evolucion && evolucion.agrupacion !== 'dia';
  const secciones = useMemo(() => agruparPorDiaConTotales(movimientos, evolucion), [movimientos, evolucion]);
  const grupos = useMemo<Grupo[]>(() => {
    if (!evolucion || evolucion.agrupacion === 'dia') return [];
    const { puntos } = evolucion;
    const finPeriodo = hasta < hoy() ? hasta : hoy();
    return puntos
      .map((p, i) => ({ ...p, hasta: i < puntos.length - 1 ? desplazar(puntos[i + 1].desde, -1, 'dias') : finPeriodo }))
      .filter((g) => g.ingresos !== 0 || g.gastos !== 0)
      .reverse(); // el más reciente primero, como los movimientos
  }, [evolucion, hasta]);

  // Tocar un grupo abre ese período con sus movimientos.
  function verGrupo(grupo: Grupo) {
    setPeriodo('personalizado');
    setDesdePersonalizado(grupo.desde);
    setHastaPersonalizado(grupo.hasta);
    setAgrupacion(null);
  }
  const balance = resumen.balance;
  const cerrarSheet = () => setSheet((s) => ({ ...s, abierto: false }));

  const encabezado = (
    <View style={{ gap: 14, paddingBottom: 4 }}>
      <EstadoConexion guardadoEn={guardadoEn} onReintentar={() => cargar(true)} />

      <View style={styles.buscador}>
        <Ionicons name="search" size={18} color={colores.textoSuave} />
        <TextInput
          style={styles.buscadorInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por descripción"
          placeholderTextColor={colores.textoSuave}
          returnKeyType="search"
        />
        {busqueda !== '' && (
          <Pressable onPress={() => setBusqueda('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colores.textoSuave} />
          </Pressable>
        )}
      </View>

      <FiltroPeriodo
        periodo={periodo}
        onPeriodo={cambiarPeriodo}
        desde={desdePersonalizado}
        hasta={hastaPersonalizado}
        onDesde={setDesdePersonalizado}
        onHasta={setHastaPersonalizado}
        conTodo
      />

      <Segmentado
        opciones={[
          { valor: 'todos', texto: 'Todos' },
          { valor: 'ingreso', texto: 'Ingresos', color: colores.ingreso },
          { valor: 'gasto', texto: 'Gastos', color: colores.gasto },
        ]}
        valor={tipo}
        onChange={setTipo}
      />

      {fechasValidas ? (
        <View style={styles.resumen}>
          <Text style={styles.rango}>
            {desde === undefined
              ? 'Todos los movimientos'
              : desde === hasta
                ? formatearFechaCorta(desde)
                : `${formatearFechaCorta(desde)}  –  ${formatearFechaCorta(hasta)}`}
          </Text>
          <View style={styles.cifras}>
            <Cifra texto="Ingresos" valor={resumen.ingresos} color={colores.ingreso} />
            <View style={styles.separador} />
            <Cifra texto="Gastos" valor={resumen.gastos} color={colores.gasto} />
            <View style={styles.separador} />
            <Cifra texto="Balance" valor={balance} color={balance < 0 ? colores.gasto : colores.ingreso} />
          </View>
        </View>
      ) : (
        <Text style={styles.error}>Revisa las fechas: usa AAAA-MM-DD y que «desde» no sea posterior a «hasta».</Text>
      )}

      {/* Hoy y Ayer son un solo día: no hay nada que agrupar. */}
      {fechasValidas && evolucion && desde !== hasta && (
        <View style={{ gap: 8 }}>
          <Text style={styles.etiqueta}>Agrupar por</Text>
          <Segmentado
            opciones={agrupaciones}
            valor={agrupacionElegida ?? evolucion.agrupacion}
            onChange={setAgrupacion}
          />
        </View>
      )}

      {fechasValidas && evolucion && <GraficoEvolucion evolucion={evolucion} tipo={tipo} />}

      {error && <Text style={styles.error}>{error}</Text>}

      {fechasValidas && !cargando && total > 0 && (
        <Text style={styles.contador}>
          {total} {total === 1 ? 'movimiento' : 'movimientos'}
          {agrupado && ' · toca un período para ver sus movimientos'}
        </Text>
      )}
    </View>
  );

  const vacio = !fechasValidas ? undefined : cargando ? (
    <ActivityIndicator style={{ marginTop: 32 }} color={colores.primario} />
  ) : (
    <View style={styles.vacio}>
      <Ionicons name="search-outline" size={36} color={colores.textoSuave} />
      <Text style={styles.vacioTexto}>No hay movimientos en este período.</Text>
    </View>
  );

  // Deslizar hacia abajo: volver a pedir todo (lo único que fuerza una petición).
  const recargarControl = (
    <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colores.primario} />
  );

  return (
    <View style={styles.container}>
      {agrupado ? (
        <FlatList
          data={fechasValidas && !cargando ? grupos : []}
          keyExtractor={(g) => g.desde}
          ListHeaderComponent={encabezado}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <FilaGrupo grupo={item} agrupacion={evolucion.agrupacion} tipo={tipo} onPress={() => verGrupo(item)} />
          )}
          ListHeaderComponentStyle={{ marginBottom: 12 }}
          refreshControl={recargarControl}
          ListEmptyComponent={vacio}
        />
      ) : (
        <SectionList
          sections={fechasValidas && !cargando ? secciones : []}
          keyExtractor={(m) => String(m.id)}
          ListHeaderComponent={encabezado}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => (
            <EncabezadoDia titulo={section.titulo} ingresos={section.ingresos} gastos={section.gastos} />
          )}
          renderItem={({ item }) => (
            <FilaMovimiento
              movimiento={item}
              onPress={() =>
                setSheet((s) => ({
                  abierto: true,
                  id: item.id,
                  clave: s.clave + 1,
                }))
              }
            />
          )}
          refreshControl={recargarControl}
          ListEmptyComponent={vacio}
        />
      )}

      <MovimientoSheet
        key={`movimiento-${sheet.clave}`}
        visible={sheet.abierto}
        id={sheet.id}
        onClose={cerrarSheet}
        onGuardado={() => {
          cerrarSheet();
          cargar();
        }}
      />
    </View>
  );
}

function Cifra({ texto, valor, color }: { texto: string; valor: number; color: string }) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.cifra}>
      <Text style={styles.cifraTexto}>{texto}</Text>
      <Text style={[styles.cifraValor, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatearMonto(valor)}
      </Text>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colores.fondo },
    buscador: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      paddingHorizontal: 14,
      boxShadow: colores.sombra,
    },
    buscadorInput: {
      flex: 1,
      fontSize: 16,
      color: colores.texto,
      paddingVertical: 12,
    },
    resumen: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      padding: 16,
      gap: 12,
      boxShadow: colores.sombra,
    },
    rango: {
      fontSize: 13,
      fontWeight: '600',
      color: colores.textoSuave,
      textAlign: 'center',
    },
    cifras: { flexDirection: 'row', alignItems: 'center' },
    cifra: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
    cifraTexto: { fontSize: 12, color: colores.textoSuave },
    cifraValor: { fontSize: 16, fontWeight: '800' },
    separador: { width: 1, height: 32, backgroundColor: colores.borde },
    contador: { fontSize: 13, color: colores.textoSuave },
    etiqueta: { fontSize: 13, fontWeight: '600', color: colores.textoSuave },
    error: { color: colores.gasto },
    vacio: { alignItems: 'center', gap: 10, marginTop: 40 },
    vacioTexto: { color: colores.textoSuave, fontSize: 15 },
  });

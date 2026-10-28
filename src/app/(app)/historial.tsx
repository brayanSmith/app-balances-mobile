import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { EstadoConexion } from '@/components/EstadoConexion';
import { agruparPorDia, EncabezadoDia, FilaMovimiento } from '@/components/FilaMovimiento';
import { GraficoEvolucion } from '@/components/GraficoEvolucion';
import { MovimientoSheet } from '@/components/MovimientoSheet';
import { Segmentado } from '@/components/Segmentado';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError, movimientosApi } from '@/lib/api';
import { ayer, desplazar, esFechaValida, formatearFechaCorta, formatearMonto, hoy } from '@/lib/format';
import { conCache, hayConexion } from '@/lib/offline';
import { radio, type Paleta } from '@/lib/theme';
import type { Movimiento, Resumen, TipoMovimiento } from '@/lib/types';

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'anio' | 'personalizado';

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'hoy', texto: 'Hoy' },
  { valor: 'ayer', texto: 'Ayer' },
  { valor: 'semana', texto: 'Última semana' },
  { valor: 'mes', texto: 'Último mes' },
  { valor: 'anio', texto: 'Último año' },
  { valor: 'personalizado', texto: 'Personalizado' },
];

/** Rango de fechas de cada período, contado hacia atrás desde hoy (incluye hoy). */
function rangoDePeriodo(periodo: Exclude<Periodo, 'personalizado'>) {
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
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState(''); // la búsqueda se aplica cuando se deja de escribir

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [pagina, setPagina] = useState(1);
  const [ultimaPagina, setUltimaPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<number | null>(null);
  const { version } = useSincronizacion();
  const [sheet, setSheet] = useState<EstadoSheet>({
    abierto: false,
    id: null,
    clave: 0,
  });
  // Si los filtros cambian mientras carga, se descarta la respuesta vieja.
  const peticion = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const rango = periodo === 'personalizado' ? null : rangoDePeriodo(periodo);
  const desde = rango?.desde ?? desdePersonalizado;
  const hasta = rango?.hasta ?? hastaPersonalizado;
  const fechasValidas = esFechaValida(desde) && esFechaValida(hasta) && desde <= hasta;

  const filtros = useMemo(
    () => ({
      desde,
      hasta,
      tipo: tipo === 'todos' ? undefined : tipo,
      q: q || undefined,
    }),
    [desde, hasta, tipo, q],
  );

  // forzar: no usar lo que está en memoria (deslizar para recargar, Reintentar).
  const cargar = useCallback(
    async (forzar = false) => {
      if (!fechasValidas) return;
      const n = ++peticion.current;
      setCargando(true);
      setError(null);
      try {
        // Sin conexión se muestra la primera página guardada de este mismo filtro
        // (los periodos se guardan por nombre: "último mes" es el último que se cargó).
        const clave = `historial:${periodo === 'personalizado' ? `${filtros.desde}:${filtros.hasta}` : periodo}:${filtros.tipo ?? ''}:${filtros.q ?? ''}`;
        const [primera, totales] = await Promise.all([
          conCache(`${clave}:lista`, () => movimientosApi.pagina(filtros, 1), {
            forzar,
          }),
          conCache(`${clave}:resumen`, () => movimientosApi.resumen(filtros), {
            forzar,
          }),
        ]);
        if (n !== peticion.current) return;
        setMovimientos(primera.datos.data);
        setPagina(1);
        setUltimaPagina(primera.datos.meta.last_page);
        setTotal(primera.datos.meta.total);
        setResumen(totales.datos);
        setGuardadoEn(primera.guardadoEn ?? totales.guardadoEn);
      } catch (e) {
        if (n === peticion.current) setError(mensajeDeError(e));
      } finally {
        if (n === peticion.current) setCargando(false);
      }
      // "version" cambia al enviar lo que estaba en cola o al volver la conexión: hay que recargar.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtros, fechasValidas, periodo, version],
  );

  // Carga al entrar y cada vez que cambia un filtro.
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  async function cargarMas() {
    if (cargando || cargandoMas || pagina >= ultimaPagina || !hayConexion()) return;
    const n = peticion.current;
    setCargandoMas(true);
    try {
      const siguiente = await movimientosApi.pagina(filtros, pagina + 1);
      if (n !== peticion.current) return;
      setMovimientos((lista) => [...lista, ...siguiente.data]);
      setPagina(siguiente.meta.current_page);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargandoMas(false);
    }
  }

  const secciones = useMemo(() => agruparPorDia(movimientos), [movimientos]);
  const balance = resumen?.balance ?? 0;
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodos}>
        {PERIODOS.map((p) => {
          const activo = p.valor === periodo;
          return (
            <Pressable
              key={p.valor}
              onPress={() => setPeriodo(p.valor)}
              style={[styles.periodo, activo && styles.periodoActivo]}
            >
              {p.valor === 'personalizado' && (
                <Ionicons name="calendar-outline" size={14} color={activo ? '#fff' : colores.texto} />
              )}
              <Text style={[styles.periodoTexto, activo && styles.periodoTextoActivo]}>{p.texto}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {periodo === 'personalizado' && (
        <View style={styles.personalizado}>
          <CampoFecha etiqueta="Desde" valor={desdePersonalizado} onChange={setDesdePersonalizado} />
          <Ionicons name="arrow-forward" size={18} color={colores.textoSuave} style={{ marginTop: 22 }} />
          <CampoFecha etiqueta="Hasta" valor={hastaPersonalizado} onChange={setHastaPersonalizado} />
        </View>
      )}

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
            {desde === hasta
              ? formatearFechaCorta(desde)
              : `${formatearFechaCorta(desde)}  –  ${formatearFechaCorta(hasta)}`}
          </Text>
          <View style={styles.cifras}>
            <Cifra texto="Ingresos" valor={resumen?.ingresos ?? 0} color={colores.ingreso} />
            <View style={styles.separador} />
            <Cifra texto="Gastos" valor={resumen?.gastos ?? 0} color={colores.gasto} />
            <View style={styles.separador} />
            <Cifra texto="Balance" valor={balance} color={balance < 0 ? colores.gasto : colores.ingreso} />
          </View>
        </View>
      ) : (
        <Text style={styles.error}>Revisa las fechas: usa AAAA-MM-DD y que «desde» no sea posterior a «hasta».</Text>
      )}

      {fechasValidas && resumen?.evolucion && <GraficoEvolucion evolucion={resumen.evolucion} tipo={tipo} />}

      {error && <Text style={styles.error}>{error}</Text>}

      {fechasValidas && !cargando && total > 0 && (
        <Text style={styles.contador}>
          {total} {total === 1 ? 'movimiento' : 'movimientos'}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <SectionList
        sections={fechasValidas && !cargando ? secciones : []}
        keyExtractor={(m) => String(m.id)}
        ListHeaderComponent={encabezado}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => <EncabezadoDia titulo={section.titulo} />}
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
        onEndReached={cargarMas}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          cargandoMas ? <ActivityIndicator color={colores.primario} style={{ marginTop: 12 }} /> : undefined
        }
        ListEmptyComponent={
          !fechasValidas ? undefined : cargando ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colores.primario} />
          ) : (
            <View style={styles.vacio}>
              <Ionicons name="search-outline" size={36} color={colores.textoSuave} />
              <Text style={styles.vacioTexto}>No hay movimientos en este período.</Text>
            </View>
          )
        }
      />

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
    periodos: { gap: 8, paddingRight: 8 },
    periodo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radio.sm,
      backgroundColor: colores.tarjeta,
      borderWidth: 1,
      borderColor: colores.borde,
    },
    periodoActivo: {
      backgroundColor: colores.primario,
      borderColor: colores.primario,
    },
    periodoTexto: { color: colores.texto, fontWeight: '500' },
    periodoTextoActivo: { color: '#fff', fontWeight: '700' },
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
    error: { color: colores.gasto },
    vacio: { alignItems: 'center', gap: 10, marginTop: 40 },
    vacioTexto: { color: colores.textoSuave, fontSize: 15 },
  });

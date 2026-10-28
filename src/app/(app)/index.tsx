import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoriaIcono } from '@/components/CategoriaIcono';
import { EstadoConexion } from '@/components/EstadoConexion';
import { agruparPorDia, EncabezadoDia, FilaMovimiento } from '@/components/FilaMovimiento';
import { MenuLateral } from '@/components/MenuLateral';
import { MiniGrafico } from '@/components/MiniGrafico';
import { MovimientoSheet } from '@/components/MovimientoSheet';
import { PagarSheet } from '@/components/PagarSheet';
import { PagosPendientes } from '@/components/PagosPendientes';
import { RestablecerSheet } from '@/components/RestablecerSheet';
import { useSession } from '@/context/auth';
import { useCategorias } from '@/context/categorias';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError, movimientosApi, programacionesApi } from '@/lib/api';
import type { EnCola } from '@/lib/cola';
import { claveMes, formatearMonto, nombreMes } from '@/lib/format';
import { conCache } from '@/lib/offline';
import { degradado, degradadoNegativo, type NombreIcono, type Paleta, radio } from '@/lib/theme';
import type { Movimiento, Pendiente, Resumen } from '@/lib/types';

interface EstadoSheet {
  abierto: boolean;
  id: number | null;
  clave: number; // cambia en cada apertura para empezar con el formulario limpio
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { user } = useSession();
  const { recargar: recargarCategorias } = useCategorias();
  const { cola, enLinea, version, descartar, reintentar, vaciar } = useSincronizacion();
  const [mes, setMes] = useState(() => new Date());
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [restablecer, setRestablecer] = useState({ abierto: false, clave: 0 });
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  // Cuándo se guardaron los datos mostrados si vienen de la caché (sin conexión).
  const [guardadoEn, setGuardadoEn] = useState<number | null>(null);
  const [pago, setPago] = useState<{
    abierto: boolean;
    pendiente: Pendiente | null;
    clave: number;
  }>({
    abierto: false,
    pendiente: null,
    clave: 0,
  });
  const [sheet, setSheet] = useState<EstadoSheet>({
    abierto: false,
    id: null,
    clave: 0,
  });

  // forzar: no usar lo que está en memoria (deslizar para recargar, Reintentar).
  const cargar = useCallback(
    async (forzar = false) => {
      setError(null);
      try {
        const filtros = { mes: claveMes(mes) };
        // Sin conexión se muestra lo último guardado de este mes.
        const [lista, totales, porPagar] = await Promise.all([
          conCache(`inicio:${filtros.mes}:lista`, () => movimientosApi.listar(filtros), { forzar }),
          conCache(`inicio:${filtros.mes}:resumen`, () => movimientosApi.resumen(filtros), { forzar }),
          conCache(`inicio:${filtros.mes}:pendientes`, () => programacionesApi.pendientes({ mes: filtros.mes }), {
            forzar,
          }),
        ]);
        setMovimientos(lista.datos);
        setResumen(totales.datos);
        setPendientes(porPagar.datos);
        const fechas = [lista, totales, porPagar].map((r) => r.guardadoEn).filter((f) => f !== null);
        setGuardadoEn(fechas.length ? Math.min(...fechas) : null);
      } catch (e) {
        setError(mensajeDeError(e));
      } finally {
        setCargando(false);
      }
      // "version" cambia al enviar lo que estaba en cola o al volver la conexión: hay que recargar.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mes, version],
  );

  // Recarga al entrar a la pantalla (también al volver de Categorías) y al cambiar de mes.
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  // Lo registrado sin conexión que aún no llega a la API, como filas "locales".
  const locales = useMemo(() => {
    const clave = claveMes(mes);
    return cola
      .filter((e) => e.movimientoId === null && e.vista.fecha.startsWith(clave))
      .map((e, i): [number, EnCola, Movimiento] => [
        -(i + 1),
        e,
        {
          id: -(i + 1),
          tipo: e.vista.tipo,
          monto: e.vista.monto,
          descripcion: e.vista.descripcion,
          categoria: e.vista.categoria,
          fecha: e.vista.fecha,
          fecha_programada: null,
          adjuntos_count: e.archivos.length,
          programado: e.operacion.tipo === 'pago',
          programacion: null,
          local: { error: e.error, enviando: enLinea && !e.error },
        },
      ]);
  }, [cola, mes, enLinea]);

  const secciones = useMemo(() => {
    const todos = [...locales.map(([, , m]) => m), ...movimientos];
    todos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return agruparPorDia(todos);
  }, [locales, movimientos]);

  // Totales del mes + lo que está en cola, para que el balance refleje lo registrado.
  const resumenVisible = useMemo(() => {
    if (!resumen) return null;
    let ingresos = resumen.ingresos;
    let gastos = resumen.gastos;
    for (const [, , m] of locales) {
      if (m.tipo === 'ingreso') ingresos += m.monto;
      else gastos += m.monto;
    }
    return { ...resumen, ingresos, gastos, balance: ingresos - gastos };
  }, [resumen, locales]);

  // Un programado con el pago en cola no se vuelve a ofrecer para pagar.
  const pendientesVisibles = useMemo(() => {
    const pagados = new Set(cola.flatMap((e) => (e.operacion.tipo === 'pago' ? [e.operacion.programacionId] : [])));
    return pendientes.filter((p) => !pagados.has(p.id));
  }, [pendientes, cola]);

  /** Tocar un movimiento que aún no se envía: ver el motivo del error, reintentar o descartarlo. */
  function accionLocal(id: number) {
    const elemento = locales.find(([idLocal]) => idLocal === id)?.[1];
    // Se está enviando en este momento: descartarlo podría chocar con el envío.
    if (!elemento || (enLinea && !elemento.error)) return;
    const mensaje = elemento.error
      ? `No se pudo enviar: ${elemento.error}`
      : 'Todavía no se envía: se enviará solo cuando haya conexión.';

    if (Platform.OS === 'web') {
      if (elemento.error && window.confirm(`${mensaje}\n\n¿Reintentar ahora?`)) reintentar(elemento.id);
      else if (window.confirm(`${mensaje}\n\n¿Descartar este movimiento?`)) descartar(elemento.id);
      return;
    }
    Alert.alert(elemento.vista.descripcion, mensaje, [
      { text: 'Cerrar', style: 'cancel' },
      ...(elemento.error ? [{ text: 'Reintentar', onPress: () => reintentar(elemento.id) }] : []),
      {
        text: 'Descartar',
        style: 'destructive' as const,
        onPress: () => descartar(elemento.id),
      },
    ]);
  }

  const enNegativo = (resumenVisible?.balance ?? 0) < 0;
  const serieBalance = useMemo(() => (resumen?.balance_diario ?? []).map((d) => d.balance), [resumen]);

  const cambiarMes = (delta: number) => {
    setCargando(true);
    setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const abrirSheet = (id: number | null) => setSheet((s) => ({ abierto: true, id, clave: s.clave + 1 }));
  const cerrarSheet = () => setSheet((s) => ({ ...s, abierto: false }));

  const encabezado = (
    <View style={{ gap: 18, paddingBottom: 8 }}>
      <View style={styles.saludo}>
        <BotonIcono icono="menu" onPress={() => setMenuAbierto(true)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.hola}>Hola, {user?.name.split(' ')[0]}</Text>
          <Text style={styles.subtitulo}>Así van tus finanzas</Text>
        </View>
      </View>

      <EstadoConexion guardadoEn={guardadoEn} onReintentar={() => cargar(true)} />

      {pendientesVisibles.length > 0 && (
        <PagosPendientes
          pendientes={pendientesVisibles}
          mes={nombreMes(mes)}
          onPagar={(pendiente) => setPago((p) => ({ abierto: true, pendiente, clave: p.clave + 1 }))}
        />
      )}

      {/* Verde si el mes va en positivo, rojo si los gastos superan a los ingresos. */}
      <LinearGradient
        colors={enNegativo ? degradadoNegativo : degradado}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.balanceCard, enNegativo && styles.balanceCardNegativo]}
      >
        <View style={styles.selectorMes}>
          <Pressable onPress={() => cambiarMes(-1)} hitSlop={12} style={styles.flecha}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </Pressable>
          <Text style={styles.mes}>{nombreMes(mes)}</Text>
          <Pressable onPress={() => cambiarMes(1)} hitSlop={12} style={styles.flecha}>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        </View>

        <Text style={styles.balanceLabel}>Balance del mes</Text>
        <Text style={styles.balance}>{formatearMonto(resumenVisible?.balance ?? 0)}</Text>

        {/* Cómo fue cambiando el balance a lo largo del mes. */}
        {serieBalance.length > 1 && (
          <View style={styles.grafico}>
            <MiniGrafico valores={serieBalance} />
          </View>
        )}

        <View style={styles.totales}>
          <Total icono="arrow-down" texto="Ingresos" valor={resumenVisible?.ingresos ?? 0} color={colores.ingreso} />
          <Total icono="arrow-up" texto="Gastos" valor={resumenVisible?.gastos ?? 0} color={colores.gasto} />
        </View>
      </LinearGradient>

      {!!resumen?.gastos_por_categoria.length && <GastosPorCategoria resumen={resumen} />}

      {aviso && (
        <Pressable style={styles.aviso} onPress={() => setAviso(null)}>
          <Ionicons name="checkmark-circle" size={20} color={colores.ingreso} />
          <Text style={styles.avisoTexto}>{aviso}</Text>
          <Ionicons name="close" size={18} color={colores.textoSuave} />
        </Pressable>
      )}

      {error && (
        <View style={styles.errorCaja}>
          <Ionicons name="cloud-offline-outline" size={20} color={colores.gasto} />
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      {secciones.length > 0 && (
        <View style={styles.tituloFila}>
          <Text style={styles.seccionTitulo}>Movimientos</Text>
          <Pressable onPress={() => router.push('/historial')} hitSlop={8} style={styles.verTodo}>
            <Text style={styles.verTodoTexto}>Ver historial</Text>
            <Ionicons name="chevron-forward" size={16} color={colores.primario} />
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {cargando && !resumen ? (
        <ActivityIndicator style={{ flex: 1 }} color={colores.primario} size="large" />
      ) : (
        <SectionList
          sections={secciones}
          keyExtractor={(m) => String(m.id)}
          ListHeaderComponent={encabezado}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => cargar(true)} />}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <EncabezadoDia titulo={section.titulo} />}
          renderItem={({ item }) => (
            <FilaMovimiento
              movimiento={item}
              onPress={() => (item.local ? accionLocal(item.id) : abrirSheet(item.id))}
            />
          )}
          ListEmptyComponent={
            cargando ? (
              <ActivityIndicator style={{ marginTop: 32 }} color={colores.primario} />
            ) : (
              <View style={styles.vacio}>
                <View style={styles.vacioIcono}>
                  <Ionicons name="wallet-outline" size={40} color={colores.primario} />
                </View>
                <Text style={styles.vacioTitulo}>Sin movimientos este mes</Text>
                <Text style={styles.vacioTexto}>Registra tu primer ingreso o gasto con el botón +</Text>
              </View>
            )
          }
        />
      )}

      <Pressable
        onPress={() => abrirSheet(null)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
        accessibilityLabel="Agregar movimiento"
      >
        <LinearGradient colors={degradado} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabFondo}>
          <Ionicons name="add" size={32} color="#fff" />
        </LinearGradient>
      </Pressable>

      <MenuLateral
        visible={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        onRestablecer={() => setRestablecer((r) => ({ abierto: true, clave: r.clave + 1 }))}
      />

      {pago.pendiente && (
        <PagarSheet
          key={`pago-${pago.clave}`}
          pendiente={pago.pendiente}
          visible={pago.abierto}
          onClose={() => setPago((p) => ({ ...p, abierto: false }))}
          onListo={(mensaje) => {
            setPago((p) => ({ ...p, abierto: false }));
            setAviso(mensaje);
            cargar();
          }}
        />
      )}

      <RestablecerSheet
        key={`restablecer-${restablecer.clave}`}
        visible={restablecer.abierto}
        onClose={() => setRestablecer((r) => ({ ...r, abierto: false }))}
        onRestablecido={() => {
          setRestablecer((r) => ({ ...r, abierto: false }));
          setAviso('Listo: tu cuenta quedó como nueva.');
          vaciar(); // lo que estaba en cola ya no debe enviarse
          recargarCategorias();
          cargar();
        }}
      />

      <MovimientoSheet
        key={`movimiento-${sheet.clave}`}
        visible={sheet.abierto}
        id={sheet.id}
        onClose={cerrarSheet}
        onGuardado={(mensaje) => {
          cerrarSheet();
          if (mensaje) setAviso(mensaje);
          cargar();
        }}
      />
    </View>
  );
}

function BotonIcono({ icono, onPress }: { icono: NombreIcono; onPress: () => void }) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);

  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.botonIcono}>
      <Ionicons name={icono} size={22} color={colores.texto} />
    </Pressable>
  );
}

interface TotalProps {
  icono: NombreIcono;
  texto: string;
  valor: number;
  color: string; // verde para ingresos, rojo para gastos
}

function Total({ icono, texto, valor, color }: TotalProps) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.total}>
      <View style={[styles.totalIcono, { backgroundColor: color }]}>
        <Ionicons name={icono} size={16} color="#fff" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.totalLabel}>{texto}</Text>
        <Text style={[styles.totalValor, { color }]} numberOfLines={1}>
          {formatearMonto(valor)}
        </Text>
      </View>
    </View>
  );
}

function GastosPorCategoria({ resumen }: { resumen: Resumen }) {
  const styles = useEstilos(crearEstilos);
  const filas = resumen.gastos_por_categoria;
  const porcentaje = (total: number) => (resumen.gastos > 0 ? (total / resumen.gastos) * 100 : 0);

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.seccionTitulo}>Gastos por categoría</Text>

      <View style={styles.barra}>
        {filas.map((f) => (
          <View key={f.categoria_id ?? 'sin-categoria'} style={{ flex: f.total, backgroundColor: f.color }} />
        ))}
      </View>

      <View style={{ gap: 12 }}>
        {filas.slice(0, 5).map((f) => (
          <View key={f.categoria_id ?? 'sin-categoria'} style={styles.categoriaFila}>
            <CategoriaIcono categoria={f} tamano={34} />
            <Text style={styles.categoriaNombre} numberOfLines={1}>
              {f.nombre}
            </Text>
            <Text style={styles.categoriaPorcentaje}>{Math.round(porcentaje(f.total))}%</Text>
            <Text style={styles.categoriaTotal}>{formatearMonto(f.total)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colores.fondo },
    saludo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingTop: 4,
    },
    hola: { fontSize: 24, fontWeight: '800', color: colores.texto },
    subtitulo: { fontSize: 14, color: colores.textoSuave, marginTop: 2 },
    botonIcono: {
      width: 44,
      height: 44,
      borderRadius: radio.md,
      backgroundColor: colores.tarjeta,
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: colores.sombra,
    },
    balanceCard: {
      borderRadius: radio.lg,
      padding: 22,
      boxShadow: '0px 12px 28px rgba(5, 150, 105, 0.35)',
    },
    balanceCardNegativo: { boxShadow: '0px 12px 28px rgba(220, 38, 38, 0.35)' },
    selectorMes: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    flecha: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mes: { fontSize: 15, fontWeight: '700', color: '#fff' },
    balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
    balance: {
      fontSize: 36,
      fontWeight: '800',
      color: '#fff',
      marginTop: 4,
      marginBottom: 14,
    },
    grafico: { marginBottom: 14, marginHorizontal: -4 },
    totales: { flexDirection: 'row', gap: 10 },
    total: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      padding: 12,
    },
    totalIcono: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    totalLabel: { color: colores.textoSuave, fontSize: 12 },
    totalValor: { fontSize: 15, fontWeight: '700' },
    tarjeta: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      padding: 18,
      gap: 16,
      boxShadow: colores.sombra,
    },
    seccionTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
    tituloFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    verTodo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    verTodoTexto: { color: colores.primario, fontWeight: '600' },
    barra: {
      flexDirection: 'row',
      height: 12,
      borderRadius: radio.xs,
      overflow: 'hidden',
      gap: 2,
    },
    categoriaFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    categoriaNombre: {
      flex: 1,
      fontSize: 15,
      color: colores.texto,
      fontWeight: '500',
    },
    categoriaPorcentaje: {
      fontSize: 13,
      color: colores.textoSuave,
      width: 40,
      textAlign: 'right',
    },
    categoriaTotal: {
      fontSize: 15,
      fontWeight: '700',
      color: colores.texto,
      minWidth: 90,
      textAlign: 'right',
    },
    errorCaja: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.gastoSuave,
      borderRadius: radio.md,
      padding: 14,
    },
    error: { color: colores.gasto, flex: 1 },
    aviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.ingresoSuave,
      borderRadius: radio.md,
      padding: 14,
    },
    avisoTexto: { flex: 1, color: colores.texto, fontWeight: '600' },
    vacio: {
      alignItems: 'center',
      marginTop: 40,
      gap: 8,
      paddingHorizontal: 24,
    },
    vacioIcono: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colores.primarioSuave,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    vacioTitulo: { fontSize: 18, fontWeight: '700', color: colores.texto },
    vacioTexto: {
      fontSize: 14,
      color: colores.textoSuave,
      textAlign: 'center',
    },
    fab: {
      position: 'absolute',
      right: 20,
      borderRadius: 32,
      boxShadow: '0px 10px 24px rgba(5, 150, 105, 0.45)',
    },
    fabFondo: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError } from '@/lib/api';
import { movimientosDb } from '@/lib/db/movimientos';
import { programacionesDb } from '@/lib/db/programaciones';
import { useConsulta } from '@/lib/db/useConsulta';
import { claveMes, formatearMonto, nombreMes } from '@/lib/format';
import { degradado, degradadoNegativo, type NombreIcono, type Paleta, radio } from '@/lib/theme';
import type { Pendiente, Resumen } from '@/lib/types';

interface EstadoSheet {
  abierto: boolean;
  id: string | null;
  clave: number; // cambia en cada apertura para empezar con el formulario limpio
}

/** Lista, totales y pendientes del mes, de la base local (se actualizan solos con cada cambio). */
async function datosDelMes(mes: string) {
  const [movimientos, resumen, pendientes] = await Promise.all([
    movimientosDb.listar({ mes }),
    movimientosDb.resumen({ mes }),
    programacionesDb.pendientes({ mes }),
  ]);
  return { movimientos, resumen, pendientes };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { user } = useSession();
  const { sincronizar, reiniciar } = useSincronizacion();
  const [mes, setMes] = useState(() => new Date());
  const clave = claveMes(mes);
  const consulta = useConsulta(() => datosDelMes(clave), ['movimientos', 'programaciones', 'categorias'], [clave]);
  const datos = consulta.datos;
  const cargando = consulta.cargando;
  const error = consulta.error ? mensajeDeError(consulta.error) : null;
  const resumen = datos?.resumen ?? null;
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [restablecer, setRestablecer] = useState({ abierto: false, clave: 0 });
  const [aviso, setAviso] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
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

  const movimientos = datos?.movimientos;
  const secciones = useMemo(() => agruparPorDia(movimientos ?? []), [movimientos]);
  const pendientes = datos?.pendientes ?? [];

  // Deslizar hacia abajo: trae lo registrado desde otros dispositivos.
  async function refrescar() {
    setRefrescando(true);
    await sincronizar();
    setRefrescando(false);
  }

  const enNegativo = (resumen?.balance ?? 0) < 0;
  const serieBalance = useMemo(() => (resumen?.balance_diario ?? []).map((d) => d.balance), [resumen]);

  const cambiarMes = (delta: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const abrirSheet = (id: string | null) => setSheet((s) => ({ abierto: true, id, clave: s.clave + 1 }));
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

      <EstadoConexion />

      {pendientes.length > 0 && (
        <PagosPendientes
          pendientes={pendientes}
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
        <Text style={styles.balance}>{formatearMonto(resumen?.balance ?? 0)}</Text>

        {/* Cómo fue cambiando el balance a lo largo del mes. */}
        {serieBalance.length > 1 && (
          <View style={styles.grafico}>
            <MiniGrafico valores={serieBalance} />
          </View>
        )}

        <View style={styles.totales}>
          <Total icono="arrow-down" texto="Ingresos" valor={resumen?.ingresos ?? 0} color={colores.ingreso} />
          <Total icono="arrow-up" texto="Gastos" valor={resumen?.gastos ?? 0} color={colores.gasto} />
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
          keyExtractor={(m) => m.id}
          ListHeaderComponent={encabezado}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <EncabezadoDia titulo={section.titulo} />}
          renderItem={({ item }) => (
            <FilaMovimiento
              movimiento={item}
              onPress={() => abrirSheet(item.id)}
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
          }}
        />
      )}

      <RestablecerSheet
        key={`restablecer-${restablecer.clave}`}
        visible={restablecer.abierto}
        onClose={() => setRestablecer((r) => ({ ...r, abierto: false }))}
        onRestablecido={() => {
          setRestablecer((r) => ({ ...r, abierto: false }));
          // Lo del teléfono (y lo que no se había enviado) se borra y se vuelve a bajar de la API.
          void reiniciar();
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

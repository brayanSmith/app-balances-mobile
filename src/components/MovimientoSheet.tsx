import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Adjuntos } from '@/components/Adjuntos';
import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { CategoriaIcono } from '@/components/CategoriaIcono';
import { CategoriaSheet } from '@/components/CategoriaSheet';
import { Segmentado } from '@/components/Segmentado';
import { useCategorias } from '@/context/categorias';
import { nuevoClienteId, useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { adjuntosApi, mensajeDeError, movimientosApi } from '@/lib/api';
import { reducirImagen } from '@/lib/imagenes';
import { ayer, esFechaValida, formatearFecha, formatearMonto, hoy, proximaFecha } from '@/lib/format';
import { esErrorDeRed, hayConexion } from '@/lib/offline';
import { conAlpha, type Paleta, radio } from '@/lib/theme';
import type {
  Adjunto,
  ArchivoLocal,
  Frecuencia,
  MovimientoInput,
  Programacion,
  TipoMovimiento,
} from '@/lib/types';

const FRECUENCIAS: { valor: Frecuencia; texto: string }[] = [
  { valor: 'dias', texto: 'Días' },
  { valor: 'semanas', texto: 'Semanas' },
  { valor: 'meses', texto: 'Meses' },
  { valor: 'anios', texto: 'Años' },
];

interface Props {
  visible: boolean;
  /** Movimiento a editar; null para crear uno nuevo. */
  id: number | null;
  onClose: () => void;
  /** Con mensaje cuando se guardó sin conexión (quedó en cola). */
  onGuardado: (mensaje?: string) => void;
}

export function MovimientoSheet({ visible, id, onClose, onGuardado }: Props) {
  const editando = id !== null;
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { categorias, recargar } = useCategorias();
  const { encolar } = useSincronizacion();
  // Id para crearlo: si el envío se repite (señal inestable), la API no lo duplica.
  const [clienteId] = useState(nuevoClienteId);

  const [tipo, setTipo] = useState<TipoMovimiento>('gasto');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoy());

  const [programado, setProgramado] = useState(false);
  const [intervalo, setIntervalo] = useState('1');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('meses');
  const [fechaFin, setFechaFin] = useState('');
  const [programacion, setProgramacion] = useState<Programacion | null>(null);
  const [aplicarASiguientes, setAplicarASiguientes] = useState(false);

  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [adjuntosAEliminar, setAdjuntosAEliminar] = useState<Adjunto[]>([]);
  const [archivosNuevos, setArchivosNuevos] = useState<ArchivoLocal[]>([]);

  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [cargando, setCargando] = useState(editando);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    movimientosApi
      .ver(id)
      .then((m) => {
        setTipo(m.tipo);
        setMonto(String(m.monto));
        setDescripcion(m.descripcion);
        setCategoriaId(m.categoria?.id ?? null);
        setFecha(m.fecha);
        setAdjuntos(m.adjuntos ?? []);
        if (m.programacion) {
          setProgramado(true);
          setIntervalo(String(m.programacion.intervalo));
          setFrecuencia(m.programacion.frecuencia);
          setFechaFin(m.programacion.fecha_fin ?? '');
          setProgramacion(m.programacion);
        }
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false));
  }, [id]);

  const colorTipo = tipo === 'ingreso' ? colores.ingreso : colores.gasto;
  const categoriasDelTipo = categorias.filter((c) => c.tipo === tipo);
  const montoNumerico = Number(monto.replace(',', '.'));
  const intervaloNumerico = Math.max(1, Math.floor(Number(intervalo)) || 1);

  // Si la regla no cambió, la próxima fecha es la que ya tiene la API; si no,
  // se calcula aquí desde la fecha del último pago.
  const reglaSinCambios =
    programacion !== null &&
    programacion.intervalo === intervaloNumerico &&
    programacion.frecuencia === frecuencia;
  const proxima = reglaSinCambios
    ? programacion.proxima_fecha
    : esFechaValida(fecha)
      ? proximaFecha(fecha, intervaloNumerico, frecuencia)
      : null;

  function cambiarTipo(nuevo: TipoMovimiento) {
    setTipo(nuevo);
    // Las categorías son de gasto o de ingreso: al cambiar de tipo se quita la elegida.
    if (categorias.find((c) => c.id === categoriaId)?.tipo !== nuevo) setCategoriaId(null);
  }

  async function guardar() {
    setError(null);
    setGuardando(true);
    const input: MovimientoInput = {
      tipo,
      monto: montoNumerico,
      descripcion: descripcion.trim(),
      categoria_id: categoriaId,
      fecha,
      programado,
      ...(programado && {
        intervalo: intervaloNumerico,
        frecuencia,
        fecha_fin: fechaFin.trim() || null,
      }),
      ...(programacion && !programacion.es_base && { actualizar_programado: aplicarASiguientes }),
    };
    try {
      // Lo nuevo va a la cola y la hoja se cierra al instante: se envía en segundo
      // plano (enseguida, o cuando vuelva internet).
      if (id === null) {
        await encolarNuevo(input);
        return;
      }

      const movimientoId = (await movimientosApi.actualizar(id, input)).id;

      // A la vez, sacando de la lista lo que ya se procesó por si algo falla a mitad.
      await Promise.all([
        ...adjuntosAEliminar.map(async (adjunto) => {
          await adjuntosApi.eliminar(adjunto.id);
          setAdjuntosAEliminar((lista) => lista.filter((a) => a !== adjunto));
        }),
        ...archivosNuevos.map(async (archivo) => {
          await adjuntosApi.subir(movimientoId, await reducirImagen(archivo));
          setArchivosNuevos((lista) => lista.filter((a) => a !== archivo));
        }),
      ]);
      onGuardado();
    } catch (e) {
      setError(
        esErrorDeRed(e) ? 'Sin conexión: para editar un movimiento ya guardado necesitas internet.' : mensajeDeError(e),
      );
      setGuardando(false);
    }
  }

  async function encolarNuevo(input: MovimientoInput) {
    await encolar(clienteId, { tipo: 'movimiento', datos: input }, archivosNuevos, {
      tipo,
      monto: montoNumerico,
      descripcion: input.descripcion,
      fecha,
      categoria: categorias.find((c) => c.id === categoriaId) ?? null,
    });
    onGuardado(hayConexion() ? undefined : 'Guardado sin conexión: se enviará solo cuando vuelva internet.');
  }

  async function eliminar() {
    if (id === null) return;
    try {
      await movimientosApi.eliminar(id);
      onGuardado();
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Sin conexión: para eliminar un movimiento necesitas internet.' : mensajeDeError(e));
    }
  }

  function confirmarEliminar() {
    // Alert con botones no funciona en web.
    if (Platform.OS === 'web') {
      if (window.confirm('¿Eliminar este movimiento?')) eliminar();
      return;
    }
    Alert.alert('Eliminar', '¿Eliminar este movimiento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: eliminar },
    ]);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo={editando ? 'Editar movimiento' : tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}
      pie={
        !cargando && (
          <>
            {error && <Text style={styles.error}>{error}</Text>}
            <Boton texto="Guardar" onPress={guardar} cargando={guardando} color={colorTipo} />
            {editando && (
              <Pressable onPress={confirmarEliminar} style={styles.eliminar}>
                <Ionicons name="trash-outline" size={18} color={colores.gasto} />
                <Text style={styles.eliminarTexto}>Eliminar movimiento</Text>
              </Pressable>
            )}
          </>
        )
      }
    >
      {cargando ? (
        <ActivityIndicator style={{ marginVertical: 60 }} color={colores.primario} />
      ) : (
        <>
          <Segmentado
            opciones={[
              { valor: 'gasto', texto: 'Gasto', icono: 'arrow-up-circle', color: colores.gasto },
              { valor: 'ingreso', texto: 'Ingreso', icono: 'arrow-down-circle', color: colores.ingreso },
            ]}
            valor={tipo}
            onChange={cambiarTipo}
          />

          <View style={styles.montoCaja}>
            <View style={styles.montoFila}>
              <Text style={[styles.montoSigno, { color: colorTipo }]}>$</Text>
              <TextInput
                style={[styles.montoInput, { color: colorTipo }]}
                value={monto}
                onChangeText={setMonto}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={conAlpha(colorTipo, 0.35)}
                autoFocus={!editando}
              />
            </View>
            <Text style={styles.ayuda}>{montoNumerico > 0 ? formatearMonto(montoNumerico) : 'Monto'}</Text>
          </View>

          <View style={styles.campo}>
            <Ionicons name="create-outline" size={20} color={colores.textoSuave} />
            <TextInput
              style={styles.campoInput}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder={tipo === 'ingreso' ? 'Ej: Pago de nómina' : 'Ej: Mercado de la semana'}
              placeholderTextColor={colores.textoSuave}
            />
          </View>

          <View>
            <Text style={styles.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categorias}>
              {categoriasDelTipo.map((c) => {
                const activa = c.id === categoriaId;
                return (
                  <Pressable
                    key={c.id}
                    style={styles.categoria}
                    onPress={() => setCategoriaId(activa ? null : c.id)}
                  >
                    <View style={[styles.anillo, activa && { borderColor: c.color }]}>
                      <CategoriaIcono categoria={c} tamano={50} solido={activa} />
                    </View>
                    <Text
                      style={[styles.categoriaNombre, activa && { color: c.color, fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {c.nombre}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.categoria} onPress={() => setCreandoCategoria(true)}>
                <View style={styles.anillo}>
                  <View style={styles.nueva}>
                    <Ionicons name="add" size={26} color={colores.primario} />
                  </View>
                </View>
                <Text style={styles.categoriaNombre}>Nueva</Text>
              </Pressable>
            </ScrollView>
          </View>

          <View>
            <Text style={styles.label}>{programado ? 'Fecha del último pago' : 'Fecha'}</Text>
            <View style={styles.fechas}>
              {[
                { texto: 'Hoy', valor: hoy() },
                { texto: 'Ayer', valor: ayer() },
              ].map((f) => (
                <Pressable
                  key={f.texto}
                  onPress={() => setFecha(f.valor)}
                  style={[styles.chip, fecha === f.valor && styles.chipActivo]}
                >
                  <Text style={[styles.chipTexto, fecha === f.valor && styles.chipTextoActivo]}>{f.texto}</Text>
                </Pressable>
              ))}
              <View style={[styles.campo, { flex: 1, paddingVertical: 0 }]}>
                <Ionicons name="calendar-outline" size={18} color={colores.textoSuave} />
                <TextInput
                  style={styles.campoInput}
                  value={fecha}
                  onChangeText={setFecha}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colores.textoSuave}
                />
              </View>
            </View>
          </View>

          <Adjuntos
            existentes={adjuntos.filter((a) => !adjuntosAEliminar.includes(a))}
            nuevos={archivosNuevos}
            onAgregar={(archivos) => setArchivosNuevos((lista) => [...lista, ...archivos])}
            onQuitarNuevo={(archivo) => setArchivosNuevos((lista) => lista.filter((a) => a !== archivo))}
            onQuitarExistente={(adjunto) => setAdjuntosAEliminar((lista) => [...lista, adjunto])}
          />

          <View style={[styles.programado, programado && { borderColor: colores.primario }]}>
            <View style={styles.filaSwitch}>
              <View style={[styles.iconoProgramado, programado && { backgroundColor: colores.primario }]}>
                <Ionicons name="repeat" size={20} color={programado ? '#fff' : colores.primario} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.programadoTitulo}>¿Es programado?</Text>
                <Text style={styles.ayudaIzq}>Te avisamos cuando se acerque cada pago, como los servicios.</Text>
              </View>
              <Switch
                value={programado}
                onValueChange={setProgramado}
                trackColor={{ true: colores.primario, false: colores.borde }}
                thumbColor="#fff"
              />
            </View>

            {programado && (
              <View style={{ gap: 14, marginTop: 16 }}>
                <View>
                  <Text style={styles.label}>Repetir cada</Text>
                  <View style={styles.filaCada}>
                    <TextInput
                      style={styles.intervalo}
                      value={intervalo}
                      onChangeText={setIntervalo}
                      keyboardType="number-pad"
                    />
                    <View style={styles.frecuencias}>
                      {FRECUENCIAS.map((f) => (
                        <Pressable
                          key={f.valor}
                          style={[styles.chip, frecuencia === f.valor && styles.chipActivo]}
                          onPress={() => setFrecuencia(f.valor)}
                        >
                          <Text style={[styles.chipTexto, frecuencia === f.valor && styles.chipTextoActivo]}>
                            {f.texto}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.campo}>
                  <Ionicons name="flag-outline" size={18} color={colores.textoSuave} />
                  <TextInput
                    style={styles.campoInput}
                    value={fechaFin}
                    onChangeText={setFechaFin}
                    placeholder="Hasta (opcional, AAAA-MM-DD)"
                    placeholderTextColor={colores.textoSuave}
                  />
                </View>

                {proxima && (
                  <View style={styles.proxima}>
                    <Ionicons name="time-outline" size={22} color={colores.primario} />
                    <View>
                      <Text style={styles.ayudaIzq}>Próximo vencimiento</Text>
                      <Text style={styles.proximaFecha}>{formatearFecha(proxima)}</Text>
                    </View>
                  </View>
                )}

                {programacion?.es_base && (
                  <Text style={styles.ayudaIzq}>
                    El monto estimado de los próximos pagos sale de este movimiento: si cambias el monto, la
                    descripción o la categoría, también cambian los siguientes.
                  </Text>
                )}

                {programacion && !programacion.es_base && (
                  <View style={styles.filaSwitch}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.programadoTitulo}>Usar estos datos para los próximos</Text>
                      <Text style={styles.ayudaIzq}>
                        {aplicarASiguientes
                          ? 'Los próximos pagos tendrán este monto estimado.'
                          : 'Solo se cambia este; los próximos mantienen el monto estimado.'}
                      </Text>
                    </View>
                    <Switch
                      value={aplicarASiguientes}
                      onValueChange={setAplicarASiguientes}
                      trackColor={{ true: colores.primario, false: colores.borde }}
                      thumbColor="#fff"
                    />
                  </View>
                )}
              </View>
            )}

            {!programado && programacion && (
              <Text style={[styles.ayudaIzq, { marginTop: 12 }]}>
                Al guardar se detiene la programación. Los movimientos ya registrados se conservan.
              </Text>
            )}
          </View>
        </>
      )}

      {creandoCategoria && (
        <CategoriaSheet
          visible
          tipoInicial={tipo}
          onClose={() => setCreandoCategoria(false)}
          onGuardada={async (nueva) => {
            await recargar();
            setCategoriaId(nueva.id);
            setCreandoCategoria(false);
          }}
        />
      )}
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    montoCaja: { alignItems: 'center', paddingVertical: 4 },
    montoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    montoSigno: { fontSize: 34, fontWeight: '700', marginRight: 4 },
    montoInput: { fontSize: 46, fontWeight: '800', minWidth: 80, textAlign: 'center', paddingVertical: 0 },
    ayuda: { color: colores.textoSuave, textAlign: 'center', marginTop: 2 },
    ayudaIzq: { color: colores.textoSuave, fontSize: 13, marginTop: 2 },
    label: { fontSize: 14, fontWeight: '600', color: colores.textoSuave, marginBottom: 10 },
    campo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    campoInput: { flex: 1, fontSize: 16, color: colores.texto, paddingVertical: 12 },
    categorias: { gap: 14, paddingRight: 8 },
    categoria: { alignItems: 'center', width: 66, gap: 6 },
    anillo: { borderWidth: 2.5, borderColor: 'transparent', borderRadius: 30, padding: 2 },
    nueva: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colores.primario,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoriaNombre: { fontSize: 12, color: colores.texto },
    fechas: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radio.sm, backgroundColor: colores.superficie },
    chipActivo: { backgroundColor: colores.primario },
    chipTexto: { color: colores.texto, fontWeight: '500' },
    chipTextoActivo: { color: '#fff', fontWeight: '600' },
    programado: { borderWidth: 1.5, borderColor: colores.borde, borderRadius: radio.md, padding: 14 },
    filaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconoProgramado: {
      width: 38,
      height: 38,
      borderRadius: radio.md,
      backgroundColor: colores.primarioSuave,
      alignItems: 'center',
      justifyContent: 'center',
    },
    programadoTitulo: { fontSize: 15, fontWeight: '600', color: colores.texto },
    filaCada: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    intervalo: {
      width: 56,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: colores.texto,
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      paddingVertical: 8,
    },
    frecuencias: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    proxima: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colores.primarioSuave,
      borderRadius: radio.md,
      padding: 14,
    },
    proximaFecha: { fontSize: 16, fontWeight: '700', color: colores.primario, marginTop: 2 },
    error: { color: colores.gasto, textAlign: 'center' },
    eliminar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
    eliminarTexto: { color: colores.gasto, fontWeight: '600' },
  });

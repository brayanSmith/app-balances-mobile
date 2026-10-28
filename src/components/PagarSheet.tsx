import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Adjuntos } from '@/components/Adjuntos';
import { BottomSheet } from '@/components/BottomSheet';
import { Boton } from '@/components/Boton';
import { CategoriaIcono } from '@/components/CategoriaIcono';
import { textoVencimiento } from '@/components/PagosPendientes';
import { nuevoClienteId, useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { adjuntosApi, mensajeDeError, programacionesApi } from '@/lib/api';
import { ayer, formatearFecha, formatearMonto, hoy } from '@/lib/format';
import { esErrorDeRed, hayConexion } from '@/lib/offline';
import { conAlpha, radio, type Paleta } from '@/lib/theme';
import type { ArchivoLocal, PagoInput, Pendiente } from '@/lib/types';

interface Props {
  pendiente: Pendiente;
  visible: boolean;
  onClose: () => void;
  /** Se pagó u omitió: recargar el inicio y mostrar el mensaje. */
  onListo: (mensaje: string) => void;
}

/**
 * Confirma el pago de un programado con el monto real, la fecha en que se pagó
 * y el comprobante. Solo entonces se crea el movimiento y cuenta en el balance.
 */
export function PagarSheet({ pendiente, visible, onClose, onListo }: Props) {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  const { encolar } = useSincronizacion();
  // Id del pago: si el envío se repite (señal inestable), la API no lo registra dos veces.
  const [clienteId] = useState(nuevoClienteId);
  const esIngreso = pendiente.tipo === 'ingreso';
  const colorTipo = esIngreso ? colores.ingreso : colores.gasto;

  const [monto, setMonto] = useState(String(pendiente.monto));
  const [fecha, setFecha] = useState(hoy());
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [usarParaProximos, setUsarParaProximos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si falla la subida de un comprobante, reintentar no vuelve a registrar el pago.
  const [movimientoId, setMovimientoId] = useState<number | null>(null);

  const montoNumerico = Number(monto.replace(',', '.'));
  const cambioElMonto = montoNumerico > 0 && montoNumerico !== pendiente.monto;

  async function confirmar() {
    setError(null);
    setGuardando(true);
    const pago = { monto: montoNumerico, fecha, actualizar_base: cambioElMonto && usarParaProximos };
    let porSubir = archivos;
    try {
      // Sin conexión, el pago queda en el dispositivo y se envía después.
      if (!hayConexion()) {
        await pagarSinConexion(pago, porSubir);
        return;
      }

      let id = movimientoId;
      if (id === null) {
        const movimiento = await programacionesApi.pagar(pendiente.id, { ...pago, cliente_id: clienteId });
        id = movimiento.id;
        setMovimientoId(id);
      }
      for (const archivo of archivos) {
        await adjuntosApi.subir(id, archivo);
        porSubir = porSubir.filter((a) => a !== archivo);
        setArchivos(porSubir);
      }
      onListo(esIngreso ? `Ingreso de ${pendiente.descripcion} registrado.` : `Pago de ${pendiente.descripcion} registrado.`);
    } catch (e) {
      // Se cayó la señal: queda en cola con el mismo cliente_id (la API no lo registra dos veces).
      if (esErrorDeRed(e)) {
        await pagarSinConexion(pago, porSubir);
        return;
      }
      setError(
        movimientoId !== null
          ? `El pago quedó registrado, pero falló la subida del comprobante: ${mensajeDeError(e)}`
          : mensajeDeError(e),
      );
      setGuardando(false);
    }
  }

  async function pagarSinConexion(pago: PagoInput, porSubir: ArchivoLocal[]) {
    await encolar(clienteId, { tipo: 'pago', programacionId: pendiente.id, datos: pago }, porSubir, {
      tipo: pendiente.tipo,
      monto: pago.monto,
      descripcion: pendiente.descripcion,
      fecha: pago.fecha,
      categoria: pendiente.categoria,
    });
    onListo(`Pago de ${pendiente.descripcion} guardado sin conexión: se enviará solo cuando vuelva internet.`);
  }

  async function omitir() {
    try {
      await programacionesApi.omitir(pendiente.id);
      onListo(`Se omitió el periodo de ${pendiente.descripcion}.`);
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Sin conexión: para omitir un periodo necesitas internet.' : mensajeDeError(e));
    }
  }

  function confirmarOmitir() {
    const mensaje = 'No se registrará nada para este vencimiento y pasará al siguiente periodo.';
    // Alert con botones no funciona en web.
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Omitir este periodo? ${mensaje}`)) omitir();
      return;
    }
    Alert.alert('Omitir este periodo', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Omitir', onPress: omitir },
    ]);
  }

  const colorEstado =
    pendiente.estado === 'vencido' ? colores.gasto : pendiente.estado === 'hoy' ? colores.aviso : colores.textoSuave;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      titulo={esIngreso ? 'Registrar ingreso' : 'Registrar pago'}
      pie={
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          <Boton
            texto={esIngreso ? 'Confirmar ingreso' : 'Confirmar pago'}
            onPress={confirmar}
            cargando={guardando}
            deshabilitado={!(montoNumerico > 0)}
            color={colorTipo}
          />
          {movimientoId === null && (
            <Pressable onPress={confirmarOmitir} style={styles.omitir}>
              <Ionicons name="play-skip-forward-outline" size={16} color={colores.textoSuave} />
              <Text style={styles.omitirTexto}>Omitir este periodo</Text>
            </Pressable>
          )}
        </>
      }
    >
      <View style={styles.resumen}>
        <CategoriaIcono categoria={pendiente.categoria} tamano={50} />
        <View style={{ flex: 1 }}>
          <Text style={styles.descripcion} numberOfLines={2}>
            {pendiente.descripcion}
          </Text>
          <Text style={[styles.estado, { color: colorEstado }]}>{textoVencimiento(pendiente)}</Text>
          <Text style={styles.ayuda}>Vencimiento: {formatearFecha(pendiente.vence)}</Text>
        </View>
      </View>
      {pendiente.periodos_vencidos > 1 && (
        <Text style={[styles.ayuda, { color: colores.gasto }]}>
          Es el más antiguo de {pendiente.periodos_vencidos} periodos vencidos. Al confirmarlo aparecerá el siguiente.
        </Text>
      )}

      <View style={styles.montoCaja}>
        <Text style={styles.label}>{esIngreso ? 'Monto recibido' : 'Monto pagado'}</Text>
        <View style={styles.montoFila}>
          <Text style={[styles.montoSigno, { color: colorTipo }]}>$</Text>
          <TextInput
            style={[styles.montoInput, { color: colorTipo }]}
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={conAlpha(colorTipo, 0.35)}
            selectTextOnFocus
          />
        </View>
        <Text style={styles.ayuda}>Estimado: {formatearMonto(pendiente.monto)}</Text>
      </View>

      {cambioElMonto && (
        <View style={styles.filaSwitch}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Usar {formatearMonto(montoNumerico)} para los próximos</Text>
            <Text style={styles.ayuda}>Por si cambió la tarifa. Si fue algo puntual, déjalo apagado.</Text>
          </View>
          <Switch
            value={usarParaProximos}
            onValueChange={setUsarParaProximos}
            trackColor={{ true: colores.primario, false: colores.borde }}
            thumbColor="#fff"
          />
        </View>
      )}

      <View>
        <Text style={[styles.label, { marginBottom: 10 }]}>{esIngreso ? 'Fecha en que llegó' : 'Fecha de pago'}</Text>
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
          <View style={styles.campo}>
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
        existentes={[]}
        nuevos={archivos}
        onAgregar={(nuevos) => setArchivos((lista) => [...lista, ...nuevos])}
        onQuitarNuevo={(archivo) => setArchivos((lista) => lista.filter((a) => a !== archivo))}
        onQuitarExistente={() => {}}
      />
    </BottomSheet>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    resumen: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    descripcion: { fontSize: 18, fontWeight: '700', color: colores.texto },
    estado: { fontSize: 14, fontWeight: '700', marginTop: 2 },
    ayuda: { fontSize: 13, color: colores.textoSuave, marginTop: 2 },
    label: { fontSize: 14, fontWeight: '600', color: colores.texto },
    montoCaja: { alignItems: 'center', gap: 2 },
    montoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    montoSigno: { fontSize: 32, fontWeight: '700', marginRight: 4 },
    montoInput: { fontSize: 42, fontWeight: '800', minWidth: 80, textAlign: 'center', paddingVertical: 0 },
    filaSwitch: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colores.primarioSuave,
      borderRadius: radio.md,
      padding: 12,
    },
    fechas: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radio.sm, backgroundColor: colores.superficie },
    chipActivo: { backgroundColor: colores.primario },
    chipTexto: { color: colores.texto, fontWeight: '500' },
    chipTextoActivo: { color: '#fff', fontWeight: '600' },
    campo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      paddingHorizontal: 12,
    },
    campoInput: { flex: 1, fontSize: 16, color: colores.texto, paddingVertical: 10 },
    error: { color: colores.gasto, textAlign: 'center' },
    omitir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
    omitirTexto: { color: colores.textoSuave, fontWeight: '600' },
  });

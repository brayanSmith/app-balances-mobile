import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { CAMPOS, camposFaltantes, MapeoColumnasSheet } from '@/components/MapeoColumnasSheet';
import { useSincronizacion } from '@/context/sincronizacion';
import { useEstilos, useTema } from '@/context/tema';
import { mensajeDeError, urlPlantilla } from '@/lib/api';
import { borrarTemporales } from '@/lib/archivos';
import { leerComprimido, type Comprimido } from '@/lib/comprimido';
import { ErrorDeImportacion, importacionesDb } from '@/lib/db/importaciones';
import { formatearFechaCorta, formatearMonto, textoRepeticion } from '@/lib/format';
import { radio, type Paleta } from '@/lib/theme';
import type {
  ArchivoLocal,
  FormatoFecha,
  Importacion,
  MapeoImportacion,
  Previsualizacion,
  ResultadoImportacion,
} from '@/lib/types';

interface OpcionesVista {
  mapeo?: MapeoImportacion;
  formato?: FormatoFecha;
  comprimido?: Comprimido | null;
}

interface ErroresImportacion {
  message: string;
  errores: { fila: number; error: string }[];
  con_error: number;
  validas: number;
}

export default function ImportarScreen() {
  const { colores } = useTema();
  const styles = useEstilos(crearEstilos);
  // Los comprobantes del ZIP: en la nube se suben, en una cuenta local se guardan en el teléfono.
  const { subirAdjuntos } = useSincronizacion();

  const [archivo, setArchivo] = useState<ArchivoLocal | null>(null);
  const [vista, setVista] = useState<Previsualizacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [errores, setErrores] = useState<ErroresImportacion | null>(null);
  const [comprimido, setComprimido] = useState<Comprimido | null>(null);
  const [subiendoComprimido, setSubiendoComprimido] = useState(false);
  // "clave" cambia en cada apertura para que la ventana arranque con el mapeo actual.
  const [ventanaMapeo, setVentanaMapeo] = useState({ abierta: false, clave: 0 });
  const [historial, setHistorial] = useState<Importacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si se cambia el mapeo varias veces seguidas, solo cuenta la última respuesta.
  const peticion = useRef(0);

  const cargarHistorial = useCallback(() => {
    importacionesDb.listar().then(setHistorial).catch(() => {});
  }, []);

  useFocusEffect(cargarHistorial);

  const abrirMapeo = () => setVentanaMapeo((v) => ({ abierta: true, clave: v.clave + 1 }));
  const cerrarMapeo = () => setVentanaMapeo((v) => ({ ...v, abierta: false }));

  async function previsualizar(elegido: ArchivoLocal, opciones: OpcionesVista = {}, abrirAlTerminar = false) {
    const n = ++peticion.current;
    setCargando(true);
    setError(null);
    setErrores(null);
    try {
      const nueva = await importacionesDb.previsualizar(elegido, opciones);
      if (n !== peticion.current) return;
      setVista(nueva);
      if (abrirAlTerminar) abrirMapeo();
    } catch (e) {
      if (n === peticion.current) setError(mensajeDeError(e));
    } finally {
      if (n === peticion.current) setCargando(false);
    }
  }

  async function elegirArchivo() {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    const elegido = { uri: a.uri, nombre: a.name, mime: a.mimeType ?? 'text/csv', file: a.file };
    setArchivo(elegido);
    setVista(null);
    setResultado(null);
    // Al elegir el CSV se abre la ventana para relacionar las columnas.
    previsualizar(elegido, { comprimido }, true);
  }

  async function elegirComprimido() {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !archivo || !vista) return;
    const a = r.assets[0];
    setSubiendoComprimido(true);
    setError(null);
    try {
      // Se lee en el teléfono: solo la lista de archivos, sin descomprimir todavía.
      const leido = await leerComprimido({ uri: a.uri, nombre: a.name, mime: a.mimeType ?? 'application/zip', file: a.file });
      setComprimido(leido);
      previsualizar(archivo, { mapeo: vista.mapeo, formato: vista.formato_fecha, comprimido: leido });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendoComprimido(false);
    }
  }

  function quitarComprimido() {
    setComprimido(null);
    if (archivo && vista) previsualizar(archivo, { mapeo: vista.mapeo, formato: vista.formato_fecha });
  }

  function aplicarMapeo(mapeo: MapeoImportacion, formato: FormatoFecha) {
    cerrarMapeo();
    if (!archivo || !vista) return;
    setVista({ ...vista, mapeo, formato_fecha: formato });
    previsualizar(archivo, { mapeo, formato, comprimido });
  }

  async function importar(omitirErrores: boolean) {
    if (!archivo || !vista) return;
    setImportando(true);
    setError(null);
    setErrores(null);
    try {
      const { resultado: r, adjuntos } = await importacionesDb.importar(
        archivo,
        { mapeo: vista.mapeo, formato: vista.formato_fecha, comprimido },
        omitirErrores,
      );
      // Cada destino hace su propia copia: después se borran los temporales extraídos del ZIP.
      for (const { movimientoId, archivos } of adjuntos) await subirAdjuntos(movimientoId, archivos);
      borrarTemporales();
      setResultado(r);
      setArchivo(null);
      setVista(null);
      setComprimido(null);
      cargarHistorial();
    } catch (e) {
      if (e instanceof ErrorDeImportacion) {
        setErrores({ message: e.message, errores: e.errores, con_error: e.conError, validas: e.validas });
      } else {
        setError(mensajeDeError(e));
      }
    } finally {
      setImportando(false);
    }
  }

  const faltan = vista ? camposFaltantes(vista.mapeo) : [];

  async function deshacer(importacion: Importacion) {
    try {
      await importacionesDb.deshacer(importacion.id);
      cargarHistorial();
      setResultado(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  function confirmarDeshacer(importacion: Importacion) {
    const mensaje = `Se eliminarán los ${importacion.importados} movimientos importados de "${importacion.archivo}".`;
    // Alert con botones no funciona en web.
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Deshacer la importación? ${mensaje}`)) deshacer(importacion);
      return;
    }
    Alert.alert('Deshacer importación', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Deshacer', style: 'destructive', onPress: () => deshacer(importacion) },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      {resultado && (
        <View style={[styles.tarjeta, styles.exito]}>
          <View style={styles.exitoIcono}>
            <Ionicons name="checkmark" size={30} color="#fff" />
          </View>
          <Text style={styles.titulo}>¡Importación lista!</Text>
          <Text style={styles.cifraGrande}>{resultado.importados}</Text>
          <Text style={styles.ayuda}>movimientos importados</Text>
          {resultado.duplicados > 0 && (
            <Text style={styles.ayuda}>{resultado.duplicados} ya existían y se omitieron.</Text>
          )}
          {resultado.omitidos > 0 && (
            <Text style={styles.ayuda}>{resultado.omitidos} filas con error se omitieron.</Text>
          )}
          {resultado.adjuntos_importados > 0 && (
            <Text style={styles.ayuda}>📎 {resultado.adjuntos_importados} comprobantes adjuntados.</Text>
          )}
          {resultado.adjuntos_faltantes.length > 0 && (
            <Text style={[styles.ayuda, { color: colores.gasto }]}>
              {resultado.adjuntos_faltantes.length} comprobantes no estaban en el comprimido (
              {resultado.adjuntos_faltantes
                .slice(0, 3)
                .map((a) => a.nombre)
                .join(', ')}
              {resultado.adjuntos_faltantes.length > 3 ? '…' : ''}).
            </Text>
          )}
          {resultado.programaciones_creadas > 0 && (
            <Text style={styles.ayuda}>
              ↻ {resultado.programaciones_creadas}{' '}
              {resultado.programaciones_creadas === 1 ? 'movimiento programado' : 'movimientos programados'}: te
              avisaremos en «Pagos pendientes» cuando se acerque cada vencimiento.
            </Text>
          )}
          {resultado.categorias_creadas.length > 0 && (
            <Text style={styles.ayuda}>Categorías nuevas: {resultado.categorias_creadas.join(', ')}.</Text>
          )}
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
            <Boton texto="Ver en el historial" onPress={() => router.push('/historial')} />
          </View>
        </View>
      )}

      {!vista && (
        <View style={styles.tarjeta}>
          <View style={styles.encabezado}>
            <View style={styles.iconoGrande}>
              <Ionicons name="document-text-outline" size={28} color={colores.primario} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>Importar desde CSV</Text>
              <Text style={styles.ayuda}>
                Trae tus movimientos de otra app, de Excel o del extracto de tu banco.
              </Text>
            </View>
          </View>
          <View style={{ gap: 6 }}>
            {[
              'Separado por comas, punto y coma o tabulaciones.',
              'Fechas AAAA-MM-DD, DD/MM/AAAA o MM/DD/AAAA.',
              'Montos como 120000, 120.000 o $ 1.234,50.',
              'Programados: columnas programado (SI/NO), cada_cuanto (1, 2…), tipo_periodo (dias, semanas, meses, anios) y hasta.',
              'Si importas el mismo archivo dos veces, no se duplica.',
            ].map((texto) => (
              <View key={texto} style={styles.punto}>
                <Ionicons name="checkmark-circle" size={16} color={colores.primario} />
                <Text style={styles.puntoTexto}>{texto}</Text>
              </View>
            ))}
          </View>
          <Boton texto="Elegir archivo CSV" onPress={elegirArchivo} cargando={cargando} />
          <Pressable onPress={() => Linking.openURL(urlPlantilla())} style={styles.enlace}>
            <Ionicons name="download-outline" size={18} color={colores.primario} />
            <Text style={styles.enlaceTexto}>Descargar plantilla de ejemplo</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {vista && archivo && (
        <>
          <View style={styles.archivo}>
            <Ionicons name="document-attach" size={22} color={colores.primario} />
            <View style={{ flex: 1 }}>
              <Text style={styles.archivoNombre} numberOfLines={1}>
                {archivo.nombre}
              </Text>
              <Text style={styles.ayuda}>
                {vista.total_filas} filas · {vista.columnas.length} columnas
              </Text>
            </View>
            <Pressable onPress={elegirArchivo} hitSlop={8}>
              <Text style={styles.enlaceTexto}>Cambiar</Text>
            </Pressable>
          </View>

          <View style={styles.tarjeta}>
            <View style={styles.filaTitulo}>
              <Text style={styles.titulo}>Columnas relacionadas</Text>
              <Pressable onPress={abrirMapeo} hitSlop={8} style={styles.editar}>
                <Ionicons name="git-compare-outline" size={16} color={colores.primario} />
                <Text style={styles.enlaceTexto}>Editar relación</Text>
              </Pressable>
            </View>
            {CAMPOS.filter(({ campo }) => vista.mapeo[campo]).map(({ campo, texto, icono }) => (
              <View key={campo} style={styles.relacion}>
                <Ionicons name={icono} size={16} color={colores.primario} />
                <Text style={styles.relacionCampo}>{texto}</Text>
                <Ionicons name="arrow-back" size={14} color={colores.textoSuave} />
                <Text style={styles.relacionColumna} numberOfLines={1}>
                  {vista.mapeo[campo]}
                </Text>
              </View>
            ))}
            {faltan.length > 0 && (
              <Pressable onPress={abrirMapeo} style={styles.faltan}>
                <Ionicons name="alert-circle" size={18} color={colores.gasto} />
                <Text style={[styles.ayuda, { color: colores.gasto, flex: 1 }]}>
                  Falta relacionar: {faltan.join(', ')}. Toca para completarlo.
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.tarjeta}>
            <View style={styles.encabezado}>
              <View style={styles.iconoGrande}>
                <Ionicons name="file-tray-full-outline" size={26} color={colores.primario} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>Comprobantes (opcional)</Text>
                <Text style={styles.ayuda}>
                  Elige un ZIP con las fotos y PDF que nombra la columna «Adjunto» y se adjuntan solos.
                </Text>
              </View>
            </View>

            {comprimido ? (
              <View style={styles.archivo}>
                <Ionicons name="archive" size={22} color={colores.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.archivoNombre} numberOfLines={1}>
                    {comprimido.nombre}
                  </Text>
                  <Text style={styles.ayudaCampo}>
                    {comprimido.archivos} archivos listos
                    {comprimido.omitidos.length > 0 ? ` · ${comprimido.omitidos.length} ignorados (no son imagen ni PDF o pesan más de 10 MB)` : ''}
                  </Text>
                </View>
                <Pressable onPress={quitarComprimido} hitSlop={8}>
                  <Text style={[styles.enlaceTexto, { color: colores.gasto }]}>Quitar</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={elegirComprimido}
                disabled={subiendoComprimido}
                style={({ pressed }) => [styles.subir, pressed && { opacity: 0.7 }]}
              >
                {subiendoComprimido ? (
                  <>
                    <ActivityIndicator color={colores.primario} />
                    <Text style={styles.enlaceTexto}>Leyendo el ZIP…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="folder-open-outline" size={20} color={colores.primario} />
                    <Text style={styles.enlaceTexto}>Elegir ZIP</Text>
                  </>
                )}
              </Pressable>
            )}

            {vista.adjuntos.referenciados > 0 && (
              <View style={{ gap: 4 }}>
                <Text
                  style={[
                    styles.label,
                    {
                      color:
                        vista.adjuntos.encontrados === vista.adjuntos.referenciados ? colores.ingreso : colores.gasto,
                    },
                  ]}
                >
                  {vista.adjuntos.encontrados} de {vista.adjuntos.referenciados} comprobantes encontrados
                </Text>
                {!comprimido && (
                  <Text style={styles.ayudaCampo}>El CSV nombra comprobantes: elige el ZIP que los contiene.</Text>
                )}
                {comprimido &&
                  vista.adjuntos.faltantes.slice(0, 5).map((a) => (
                    <Text key={`${a.fila}-${a.nombre}`} style={styles.ayudaCampo}>
                      Fila {a.fila}: no está «{a.nombre}»
                    </Text>
                  ))}
                {comprimido && vista.adjuntos.faltantes.length > 0 && (
                  <Text style={styles.ayudaCampo}>Los movimientos se importan igual, sin ese comprobante.</Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.tarjeta}>
            <View style={styles.filaTitulo}>
              <Text style={styles.titulo}>Vista previa</Text>
              {cargando && <ActivityIndicator color={colores.primario} />}
            </View>
            <View style={styles.contadores}>
              <Contador valor={vista.validas} texto="válidas" color={colores.ingreso} />
              <Contador valor={vista.con_error} texto="con error" color={colores.gasto} />
            </View>
            {vista.vista_previa.map(({ fila, datos, error: errorFila, adjuntos }) => (
              <View key={fila} style={styles.previa}>
                <Text style={styles.previaFila}>#{fila}</Text>
                {datos ? (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previaDescripcion} numberOfLines={1}>
                        {datos.descripcion}
                      </Text>
                      <Text style={styles.ayudaCampo}>
                        {formatearFechaCorta(datos.fecha)}
                        {datos.categoria ? ` · ${datos.categoria}` : ''}
                      </Text>
                      {datos.repetir && (
                        <View style={styles.previaAdjuntos}>
                          <Ionicons name="repeat" size={13} color={colores.primario} />
                          <Text style={[styles.ayudaCampo, { color: colores.primario }]}>
                            {textoRepeticion(datos.repetir.intervalo, datos.repetir.frecuencia)}
                            {datos.hasta ? ` hasta el ${formatearFechaCorta(datos.hasta)}` : ''}
                          </Text>
                        </View>
                      )}
                      {adjuntos.length > 0 && (
                        <View style={styles.previaAdjuntos}>
                          <Ionicons
                            name="attach"
                            size={13}
                            color={adjuntos.every((a) => a.encontrado) ? colores.primario : colores.gasto}
                          />
                          <Text
                            style={[
                              styles.ayudaCampo,
                              { color: adjuntos.every((a) => a.encontrado) ? colores.primario : colores.gasto },
                            ]}
                            numberOfLines={1}
                          >
                            {adjuntos.map((a) => (a.encontrado ? a.nombre : `${a.nombre} (falta)`)).join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.previaMonto,
                        { color: datos.tipo === 'ingreso' ? colores.ingreso : colores.gasto },
                      ]}
                    >
                      {datos.tipo === 'ingreso' ? '+' : '−'}
                      {formatearMonto(datos.monto)}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.error, { flex: 1 }]}>{errorFila}</Text>
                )}
              </View>
            ))}
          </View>

          {errores && (
            <View style={[styles.tarjeta, { borderColor: colores.gasto, borderWidth: 1 }]}>
              <Text style={[styles.titulo, { color: colores.gasto }]}>{errores.message}</Text>
              {errores.errores.slice(0, 8).map((e) => (
                <Text key={e.fila} style={styles.ayuda}>
                  Fila {e.fila}: {e.error}
                </Text>
              ))}
              {errores.con_error > 8 && <Text style={styles.ayuda}>… y {errores.con_error - 8} más.</Text>}
              {errores.validas > 0 && (
                <Boton
                  texto={`Importar ${errores.validas} y omitir ${errores.con_error} con error`}
                  onPress={() => importar(true)}
                  cargando={importando}
                  color={colores.gasto}
                />
              )}
            </View>
          )}

          {!errores && faltan.length === 0 && (
            <Boton
              texto={`Importar ${vista.validas} ${vista.validas === 1 ? 'movimiento' : 'movimientos'}`}
              onPress={() => importar(false)}
              cargando={importando || cargando}
            />
          )}
        </>
      )}

      {historial.length > 0 && !vista && (
        <View style={{ gap: 10 }}>
          <Text style={styles.seccion}>Importaciones anteriores</Text>
          {historial.map((i) => (
            <View key={i.id} style={styles.historial}>
              <Ionicons name="document-text-outline" size={22} color={colores.textoSuave} />
              <View style={{ flex: 1 }}>
                <Text style={styles.archivoNombre} numberOfLines={1}>
                  {i.archivo}
                </Text>
                <Text style={styles.ayudaCampo}>
                  {formatearFechaCorta(i.creada.slice(0, 10))} · {i.importados} importados
                  {i.duplicados > 0 ? ` · ${i.duplicados} duplicados` : ''}
                </Text>
              </View>
              <Pressable onPress={() => confirmarDeshacer(i)} hitSlop={8} style={styles.deshacer}>
                <Ionicons name="arrow-undo" size={14} color={colores.gasto} />
                <Text style={styles.deshacerTexto}>Deshacer</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {vista && (
        <MapeoColumnasSheet
          key={`mapeo-${ventanaMapeo.clave}`}
          visible={ventanaMapeo.abierta}
          columnas={vista.columnas}
          muestras={vista.muestras}
          mapeo={vista.mapeo}
          formato={vista.formato_fecha}
          onClose={cerrarMapeo}
          onAplicar={aplicarMapeo}
        />
      )}
    </ScrollView>
  );
}

function Contador({ valor, texto, color }: { valor: number; texto: string; color: string }) {
  const styles = useEstilos(crearEstilos);

  return (
    <View style={styles.contador}>
      <Text style={[styles.contadorValor, { color }]}>{valor}</Text>
      <Text style={styles.ayudaCampo}>{texto}</Text>
    </View>
  );
}

const crearEstilos = (colores: Paleta) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colores.fondo },
    contenido: { padding: 16, gap: 14, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
    tarjeta: {
      backgroundColor: colores.tarjeta,
      borderRadius: radio.lg,
      padding: 16,
      gap: 14,
      boxShadow: colores.sombra,
    },
    encabezado: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconoGrande: {
      width: 52,
      height: 52,
      borderRadius: radio.md,
      backgroundColor: colores.primarioSuave,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
    ayuda: { fontSize: 14, color: colores.textoSuave },
    ayudaCampo: { fontSize: 12, color: colores.textoSuave },
    punto: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    puntoTexto: { fontSize: 14, color: colores.texto, flex: 1 },
    enlace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
    enlaceTexto: { color: colores.primario, fontWeight: '600' },
    error: { color: colores.gasto },
    archivo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colores.primarioSuave,
      borderRadius: radio.md,
      padding: 14,
    },
    archivoNombre: { fontSize: 15, fontWeight: '600', color: colores.texto },
    label: { fontSize: 14, fontWeight: '600', color: colores.texto },
    filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    editar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    relacion: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    relacionCampo: { fontSize: 14, fontWeight: '600', color: colores.texto, width: 92 },
    relacionColumna: {
      flexShrink: 1,
      fontSize: 13,
      color: colores.texto,
      backgroundColor: colores.superficie,
      borderRadius: radio.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    faltan: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colores.gastoSuave,
      borderRadius: radio.md,
      padding: 10,
    },
    contadores: { flexDirection: 'row', gap: 10 },
    contador: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colores.superficie,
      borderRadius: radio.md,
      paddingVertical: 10,
    },
    contadorValor: { fontSize: 22, fontWeight: '800' },
    previa: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colores.borde,
    },
    previaFila: { fontSize: 12, color: colores.textoSuave, width: 30 },
    previaDescripcion: { fontSize: 15, fontWeight: '600', color: colores.texto },
    previaMonto: { fontSize: 15, fontWeight: '700' },
    previaAdjuntos: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    subir: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: radio.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colores.primario,
      backgroundColor: colores.primarioSuave,
    },
    exito: { alignItems: 'center', gap: 6 },
    exitoIcono: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colores.ingreso,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    cifraGrande: { fontSize: 40, fontWeight: '800', color: colores.ingreso },
    seccion: { fontSize: 15, fontWeight: '700', color: colores.textoSuave },
    historial: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colores.tarjeta,
      borderRadius: radio.md,
      padding: 14,
      boxShadow: colores.sombra,
    },
    deshacer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colores.gastoSuave,
      borderRadius: radio.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    deshacerTexto: { color: colores.gasto, fontSize: 13, fontWeight: '600' },
  });

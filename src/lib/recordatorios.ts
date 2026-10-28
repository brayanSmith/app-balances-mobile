import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatearMonto } from './format';
import type { Pendiente } from './types';

/*
 * Recordatorios de pagos programados como notificaciones LOCALES: la app las deja
 * agendadas en el sistema y suenan aunque esté cerrada o sin internet. Se vuelven a
 * calcular cada vez que se abre la app o cambia algo (pagar, omitir, editar…).
 */

/**
 * En web no hay notificaciones agendadas. En Expo Go para Android la librería falla al
 * importarse (le falta el módulo nativo ExpoTopicSubscriptionModule): ahí la app sigue
 * funcionando, solo que sin recordatorios.
 */
function cargarNotificaciones(): typeof ExpoNotifications | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
}

const Notifications = cargarNotificaciones();

export const recordatoriosDisponibles = Notifications !== null;

const CANAL = 'recordatorios';
const HORA = 9; // los avisos llegan a las 9:00
const MAXIMO = 60; // iOS admite hasta 64 notificaciones agendadas por app

if (Notifications) {
  // Con la app abierta también se muestran.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type EstadoPermiso = 'concedido' | 'denegado' | 'preguntar' | 'no-disponible';

export async function estadoPermiso(): Promise<EstadoPermiso> {
  if (!Notifications) return 'no-disponible';
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'concedido';
  return canAskAgain ? 'preguntar' : 'denegado';
}

/** Muestra el diálogo del sistema (solo si todavía se puede preguntar). */
export async function pedirPermiso(): Promise<boolean> {
  if (!Notifications) return false;
  // En Android 13+ el diálogo solo aparece si ya existe un canal.
  await crearCanal();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function crearCanal() {
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Pagos por vencer',
    description: 'Avisos de pagos e ingresos programados que vencen pronto o están vencidos.',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function cancelarRecordatorios() {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

interface Aviso {
  fecha: Date;
  titulo: string;
  cuerpo: string;
}

/** "2026-11-15" (+ días) → ese día a las 9:00, hora local. */
function aLas9(fecha: string, mas = 0) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia + mas, HORA);
}

/** Próximas 9:00 (hoy si aún no son, si no mañana), + días. */
function proximas9(mas = 0) {
  const d = new Date();
  d.setHours(HORA, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + mas);
  return d;
}

/**
 * Avisos de cada programación: el día antes, el día que vence y el día después
 * (por si no se pagó). Lo ya vencido se agrupa en un recordatorio diario los
 * próximos 3 días.
 */
function calcularAvisos(pendientes: Pendiente[]): Aviso[] {
  const avisos: Aviso[] = [];

  for (const p of pendientes.filter((p) => p.dias >= 0)) {
    const monto = `${formatearMonto(p.monto)} (estimado)`;
    const gasto = p.tipo === 'gasto';
    avisos.push(
      {
        fecha: aLas9(p.vence, -1),
        titulo: gasto ? `Mañana vence: ${p.descripcion}` : `Mañana deberías recibir: ${p.descripcion}`,
        cuerpo: `${monto}. Toca para registrarlo.`,
      },
      {
        fecha: aLas9(p.vence),
        titulo: gasto ? `Hoy vence: ${p.descripcion}` : `Hoy deberías recibir: ${p.descripcion}`,
        cuerpo: `${monto}. Toca para registrarlo.`,
      },
      {
        fecha: aLas9(p.vence, 1),
        titulo: gasto ? `Venció ayer: ${p.descripcion}` : `No has registrado: ${p.descripcion}`,
        cuerpo: `${monto}. Si ya lo pagaste, regístralo para que tu balance esté al día.`,
      },
    );
  }

  const vencidos = pendientes.filter((p) => p.dias < 0);
  if (vencidos.length > 0) {
    const titulo =
      vencidos.length === 1
        ? `Tienes un pago vencido: ${vencidos[0].descripcion}`
        : `Tienes ${vencidos.length} pagos vencidos`;
    const cuerpo = vencidos
      .slice(0, 4)
      .map((p) => `${p.descripcion} · ${formatearMonto(p.monto)}`)
      .join('\n');
    for (let dia = 0; dia < 3; dia++) avisos.push({ fecha: proximas9(dia), titulo, cuerpo });
  }

  return avisos
    .filter((a) => a.fecha.getTime() > Date.now())
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .slice(0, MAXIMO);
}

/** Reemplaza todos los recordatorios agendados por los de estos pendientes. */
export async function programarRecordatorios(pendientes: Pendiente[]) {
  if (!Notifications) return;
  await crearCanal();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const aviso of calcularAvisos(pendientes)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: aviso.titulo, body: aviso.cuerpo, data: { url: '/' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: aviso.fecha, channelId: CANAL },
    });
  }
}

# Publicar en Google Play

Guía para subir **Balances** a Play Console: qué subir, qué escribir y qué responder en cada formulario.

## URLs que pide Google

| Para | URL |
|---|---|
| Política de privacidad | https://app-balances-api-production-n7widq.laravel.cloud/privacidad |
| Eliminar la cuenta (web) | https://app-balances-api-production-n7widq.laravel.cloud/eliminar-cuenta |

Las dos las sirve la API. El correo de contacto que muestran sale de `CONTACTO_EMAIL` en Laravel Cloud o, si no está, de `MAIL_FROM_ADDRESS`.

> **Revisa la política de privacidad** antes de publicarla: está redactada a partir de lo que hace la app, pero el responsable legal eres tú.

## 1. Crear la app

Play Console → **Crear app**:

- Nombre: `Balances`
- Idioma predeterminado: Español (Latinoamérica) – `es-419`
- App o juego: **App**
- Gratis o de pago: **Gratis**

## 2. Subir la primera versión (prueba interna)

1. El `.aab` lo genera EAS: `eas build -p android --profile production`.
2. **Probar → Prueba interna → Crear versión** y sube el `.aab`. La primera vez es a mano; las siguientes pueden ir con `eas submit -p android`.
3. Acepta la **firma de apps de Google Play**.
4. Notas de la versión:
   ```
   Primera versión de Balances: registra ingresos y gastos, adjunta comprobantes, programa pagos con recordatorios, importa desde CSV y analiza tu saldo.
   ```
5. En **Testers**, crea una lista con tu correo y compártela con el enlace de participación.

### Google en la versión de Play

Google Play vuelve a firmar la app con su propia llave, así que "Continuar con Google" necesita **otro cliente Android** en Google Cloud:

1. En Play Console: **Configuración → Integridad de la app → Firma de apps**. Copia el **certificado SHA-1 de la clave de firma de apps**.
2. En Google Cloud → Credenciales → **Crear ID de cliente de OAuth → Android**:
   - paquete `com.brayansmith.balances`;
   - esa SHA-1.

El cliente Android que ya existe (el de la llave de EAS) se queda: sirve para los APK de prueba.

## 3. Contenido de la app (Política → Contenido de la app)

| Sección | Respuesta |
|---|---|
| **Política de privacidad** | La URL de `/privacidad` |
| **Anuncios** | No contiene anuncios |
| **Acceso a la app** | Algunas funciones están restringidas. Instrucciones: «Inicia sesión con este correo y contraseña». Crea antes esa cuenta de prueba en la app (con datos de ejemplo) y pon aquí sus datos. |
| **Clasificación del contenido** | Categoría *Utilidad, productividad, comunicación u otro*. No a todo: violencia, contenido sexual, lenguaje, drogas, juegos de azar, compras digitales, interacción entre usuarios y compartir ubicación. |
| **Público objetivo** | 18 años o más |
| **App de noticias** | No |
| **Apps gubernamentales** | No |
| **Funciones financieras** | Es solo para **registrar ingresos y gastos personales**: no ofrece préstamos, pagos, transferencias, inversiones, criptomonedas, seguros ni banca. |
| **Salud** | No |
| **Seguridad de los datos** | Ver abajo |
| **Eliminación de la cuenta** | La URL de `/eliminar-cuenta` |

### Seguridad de los datos

- ¿Recopila o comparte datos del usuario? **Sí**.
- ¿Los datos se cifran en tránsito? **Sí** (HTTPS).
- ¿Los usuarios pueden pedir que se borren? **Sí**: en la app (Mi perfil → Eliminar cuenta) y en la URL de `/eliminar-cuenta`.
- ¿Se comparten con terceros? **No**. Laravel Cloud, Google y el proveedor de correo actúan como proveedores de servicio, y eso no cuenta como "compartir".

Tipos de datos **recopilados**:

| Categoría → tipo | ¿Obligatorio? | Para qué |
|---|---|---|
| Información personal → **Nombre** | Obligatorio | Funcionalidad de la app, gestión de la cuenta |
| Información personal → **Dirección de correo electrónico** | Obligatorio | Funcionalidad de la app, gestión de la cuenta |
| Información personal → **ID de usuario** (si entra con Google) | Opcional | Gestión de la cuenta |
| Información financiera → **Otra información financiera** (movimientos, montos, programados) | Obligatorio | Funcionalidad de la app |
| Fotos y videos → **Fotos** (comprobantes y foto de perfil) | Opcional | Funcionalidad de la app |
| Archivos y documentos → **Archivos y documentos** (PDF, CSV, ZIP para importar) | Opcional | Funcionalidad de la app |

Ninguno se procesa "de forma efímera" (se guardan en el servidor), salvo los ZIP de importación, que se borran en 24 horas.

## 4. Ficha de Play Store (Crecimiento → Ficha de Play Store)

**Nombre de la app** (máx. 30):
```
Balances: ingresos y gastos
```

**Descripción breve** (máx. 80):
```
Registra tus ingresos y gastos, programa pagos y mira a dónde va tu dinero.
```

**Descripción completa** (máx. 4000):
```
Balances te ayuda a llevar tus finanzas personales sin complicaciones.

• Registra ingresos y gastos en segundos, con categorías y la foto de la factura o el PDF como comprobante.
• Programa tus pagos e ingresos recurrentes (arriendo, servicios, salario) y recibe recordatorios antes de que venzan.
• Mira tu balance del mes, el historial completo con búsqueda y filtros, y agrupa por semana, mes o año.
• Análisis con gráficos de área y de velas de tu saldo, y una proyección de cómo cerrarás los próximos meses.
• Importa tus movimientos desde un archivo CSV (por ejemplo, el extracto de tu banco) con sus comprobantes en ZIP.
• Funciona sin conexión: lo que registres se envía solo cuando vuelva internet.
• Entra con tu correo o con tu cuenta de Google.
• Modo oscuro.

Tus datos son tuyos: no mostramos publicidad, no vendemos tu información y puedes eliminar tu cuenta y todos tus datos cuando quieras desde la app.
```

**Categoría:** Finanzas · **Correo de contacto:** el mismo de la política de privacidad.

### Gráficos

| Recurso | Tamaño | Cómo |
|---|---|---|
| Ícono | 512×512 PNG | Listo: `store/icono-512.png` |
| Gráfico de funciones | 1024×500 PNG/JPG | Listo: `store/grafico-funciones-1024x500.png` |
| Capturas de teléfono | mín. 2, ideal 4–8, vertical 9:16 | Del emulador: inicio, historial, análisis, registrar movimiento |

Para las capturas, abre la app en el emulador con datos de ejemplo y usa el botón de cámara de su barra lateral, o `adb exec-out screencap -p > captura.png`.

## 5. Prueba cerrada y producción

Las **cuentas personales nuevas** de Play Console deben hacer una **prueba cerrada con al menos 12 testers durante 14 días seguidos** antes de poder pedir acceso a producción.

1. **Probar → Prueba cerrada → Crear canal**, sube la misma versión y agrega los correos de los testers (o un grupo de Google).
2. Cada tester acepta la invitación desde el enlace de participación e instala la app desde Play.
3. Pasados los 14 días con 12 testers, en el **Panel** aparece **Solicitar acceso a producción**. Google hace unas preguntas sobre la prueba y revisa.
4. Con el acceso aprobado: **Producción → Crear versión**.

## Versiones siguientes

- **Solo cambios de pantallas o lógica (JavaScript):** `npm run actualizar:produccion -- "Qué cambió"`. Llega sin pasar por la revisión de Play.
- **Cambios nativos** (librerías nuevas, permisos, `app.json`):
  ```powershell
  eas build -p android --profile production
  eas submit -p android
  ```
  El número de versión (`versionCode`) sube solo.

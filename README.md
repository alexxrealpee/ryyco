<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/be9196c8-7041-4ba9-b337-ca71c1485d15

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Notificaciones de pedidos con la app cerrada (Node.js)

El servidor escucha nuevos documentos `orders` y envía FCM HTTP v1 mediante Firebase Admin a administración y a la tienda del pedido. No depende de una pestaña abierta. El MP3 personalizado funciona en el panel abierto; las notificaciones del sistema usan el sonido que permita el dispositivo.

Configuración de producción:

1. Publicar `firestore.rules` en el proyecto `studio-9002217802-13e05`, base `ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15`, antes de habilitar el envío. Estas reglas restringen quién puede registrar dispositivos de administración y tiendas. Con Firebase CLI autenticado: `firebase deploy --only firestore:rules --project studio-9002217802-13e05`.
2. Configurar una cuenta de servicio con permisos de lectura/escritura de Firestore y envío de Firebase Cloud Messaging. Guardar su JSON fuera de `public/`, `dist/` y del repositorio. Definir `GOOGLE_APPLICATION_CREDENTIALS` con la ruta privada en el servidor. También se admite `FIREBASE_SERVICE_ACCOUNT_JSON` desde el almacén de secretos del hosting. La clave pública VAPID no reemplaza estas credenciales.
3. Ejecutar `npm ci`, `npm run build` y mantener `NODE_ENV=production npm start` con el supervisor del hosting. No requiere el antiguo `FCM_SERVER_KEY` para pedidos nuevos. La escucha automática se activa en `server/orderPush.ts`.
4. Publicar la web con HTTPS y activar de nuevo las notificaciones desde cada panel/dispositivo. En iPhone/iPad, usar la PWA añadida a la pantalla de inicio (iOS/iPadOS 16.4 o posterior).
5. Consultar `/api/push/status`: deben aparecer `configured: true` y `listening: true`. Cerrar todos los paneles y crear un pedido de prueba autorizado. Confirmar la recepción en ambos dispositivos y que al tocar el aviso se abre el panel correcto.

El primer arranque no avisa de pedidos anteriores. Tras reiniciar recupera pedidos pendientes de las últimas 24 horas desde la primera activación; guarda comprobantes por pedido/dispositivo y reintenta fallos temporales. Una caída entre el envío y el registro del comprobante puede repetir el aviso; el identificador de notificación estable permite reemplazarlo. La entrega depende de conectividad, permisos y restricciones del sistema (incluido cierre forzado/ahorro de batería). Sin credenciales y prueba real en producción, el envío no debe considerarse activado.


## GPS de domiciliarios en Hostinger con PHP (sin Node.js)

1. Ejecutar `npm run build:client` y subir TODO el contenido de `dist/` a `public_html/`, incluyendo `.htaccess` y `api/driver-tracking-auth.php`. Los pasos `postbuild` excluyen las copias de `keys.php`, archivos `.env` y cuentas de servicio del resultado público; conservar por separado la configuración privada del hosting.
2. Crear una cuenta de servicio del proyecto Firebase `studio-9002217802-13e05` con acceso de lectura a la base Firestore `ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15`. Descargar su JSON privado desde la consola de Firebase/Google Cloud. No usar la clave pública web como sustituto.
3. En el administrador de archivos de Hostinger, subir el JSON como `firebase-service-account.json` en la carpeta PADRE de `public_html`, nunca dentro de `public_html`, `dist`, `public` o GitHub. Restringir sus permisos a lectura del usuario del hosting (por ejemplo, 600). Alternativamente definir `GOOGLE_APPLICATION_CREDENTIALS` con una ruta privada externa, o `FIREBASE_SERVICE_ACCOUNT_JSON` en el entorno del servidor. El endpoint rechaza archivos que estén dentro del directorio público.
4. PHP 8.3 debe tener las extensiones cURL y OpenSSL y conexión HTTPS saliente a Google. La verificación del certificado permanece habilitada.
5. Abrir `https://ryyco.com/api/driver-tracking-auth.php`: debe devolver JSON con `platform: "PHP"` y `configured: true`. Esto confirma la instalación y la presencia de credenciales; los permisos de Google se comprueban al autenticar, no en este diagnóstico público.
6. Con un pedido activo, el domiciliario pulsa **Verificar mi cuenta con Google**, elige el correo exacto de su cuenta aprobada y permite el GPS. La verificación valida la firma del token de Google/Firebase y su proyecto antes de emitir una sesión con el identificador del domiciliario asignado. No se confía en contraseñas ni perfiles del almacenamiento local.
7. Confirmar **GPS confirmado** en el domiciliario y el marcador en el cliente con el pedido abierto. En la app Capacitor se necesita instalar una compilación nueva; subir la web no actualiza un APK ya instalado. El cliente también necesita una sesión verificada que cumpla las reglas de lectura de ese pedido.

Pruebas locales del puente PHP: `node scripts/test-hostinger-tracking-auth.cjs`, con `PHP_BINARY` apuntando a PHP 8.3 (y OpenSSL habilitado). La creación de sesiones usa el formato de tokens personalizados documentado por Firebase: https://firebase.google.com/docs/auth/admin/create-custom-tokens.

### Inicio paginado y fotografías independientes

El HTML inicia dos solicitudes independientes a `api/catalog-page.php`: perfiles públicos de restaurantes y una primera página de 12 productos. Se consultan solo los campos necesarios; las imágenes base64, portadas y QR no forman parte de esos datos. Cada respuesta se confirma con Firestore en vivo. La paginación usa el ID de documento y un máximo de 24 documentos por página; no requiere índices compuestos nuevos.

La interfaz muestra seis productos elegibles y solicita nuevas páginas cerca del final. Si encuentra tiendas cerradas, bebidas o productos inactivos, continúa hasta llenar la tanda. Al buscar, filtrar o cambiar la ordenación puede consultar más páginas de metadatos para completar los resultados. Las solicitudes simultáneas se comparten. Si PHP falla, la alternativa de Firebase también está limitada a 12 documentos por página.

`api/catalog-image.php` descarga solamente la fotografía solicitada. Su URL incluye la versión del documento y reutiliza archivos en `catalog-images` y la caché del navegador; los cambios generan una URL nueva. El listener de perfiles de Firestore conserva los cierres y reaperturas en vivo. Ningún archivo estático confirma disponibilidad. El asistente solicita su catálogo al abrirse y las recomendaciones utilizan su suscripción sin duplicar la lectura inicial.

Las fotografías se habilitan cerca de la pantalla (200 px) y se descargan como máximo tres a la vez, reservando conexiones para metadatos. Mientras conecta la escucha de perfiles, la respuesta pequeña de disponibilidad puede renovarse desde Firestore; una renovación fallida nunca extiende su vigencia. La escucha actual todavía recibe documentos completos de perfiles: las fotos base64 heredadas siguen siendo un costo de esa conexión, aunque ya no bloquean la primera presentación. Las proyecciones reducen bytes, no el número facturado de documentos; las renovaciones y la primera lectura de una imagen también tienen costo de lectura.

Hostinger debe desplegar todo `dist`, incluidos `api/catalog-page.php`, `api/catalog-image.php`, `api/catalog-live.php` y `.htaccess`. PHP necesita cURL, HTTPS a Firestore y escritura en `catalog-images` para reutilizar fotografías. El despliegue conectado a GitHub debe finalizar antes de comprobar producción.

Pruebas: `node scripts/test-product-loading.cjs`, `node scripts/test-store-availability.cjs`, `node --test scripts/test-catalog-bootstrap.mjs`, `node scripts/test-hostinger-catalog.cjs` (con PHP_BINARY). La medición `node scripts/measure-home.cjs --local` utiliza Chrome/Playwright y PHP, 390×844, 200.000 bytes/s, 150 ms de latencia y CPU 4×. Las capturas y métricas quedan en `build/performance` fuera de Git; las rutas se configuran con CHROME_BINARY, PHP_BINARY y RYYCO_NODE_MODULES.


### Mapa privado de domiciliarios disponibles

En Administración general → Domiciliarios, **Ver disponibles en el mapa** abre una vista con suscripciones en tiempo real. Solo aparecen marcadores de domiciliarios aprobados, disponibles, con datos confirmados por Firebase y GPS de menos de 45 segundos. Los demás figuran como **Sin GPS reciente**; no se inventa una ubicación.

El portal del domiciliario comparte su última posición en `driver_presence/{driverId}` mientras está abierto y el domiciliario está disponible, con permiso GPS. Durante una entrega reutiliza el GPS existente. Al salir o desactivar disponibilidad, detiene el envío y elimina la posición; si el dispositivo pierde conexión, el marcador caduca. No proporciona rastreo en segundo plano con el navegador cerrado. La colección guarda solo la última posición y únicamente administración puede leerla.

Antes de utilizar esta función en producción, publicar las reglas actualizadas de `firestore.rules` en la base de datos configurada de RYYCO (`ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15`, proyecto `studio-9002217802-13e05`). El despliegue de Hostinger no publica reglas de Firebase. Actualizar también el portal que usan los domiciliarios. La configuración `firebase.security.json` sirve exclusivamente para las pruebas locales del emulador.


### Notificaciones Android para domiciliarios, restaurantes y administración

Android usa `@capacitor/push-notifications` y un token FCM nativo; no utiliza el service worker web ni VAPID. La app crea el canal `ryyco_orders_v2` con IMPORTANCE_HIGH (4), vibración, visibilidad en bloqueo y el sonido incluido `res/raw/ryyco_order.mp3`, copiado del audio oficial de tres segundos. Se crea desde Application antes de recibir FCM, incluso con arranque en frío, y también se muestran avisos en primer plano. El canal anterior apuntaba a un recurso inexistente `raw/default`; el identificador nuevo permite corregir ese defecto sin borrar canales ni cambiar las preferencias que el usuario configure en el nuevo canal. No usar `sound: "default"` en createChannel de Capacitor: se interpreta como un recurso raw. Al activar notificaciones, el token solo se considera registrado si se guardó en Firestore. Se renueva al abrir el portal y al volver a primer plano. Al cerrar sesión se anula el registro nativo y se eliminan sus asociaciones locales. El botón de activación sigue siendo necesario si el permiso no fue concedido.

El servicio `functions/orderPush.cjs` envía avisos de pedidos nuevos desde Firebase, sin depender de una pestaña abierta ni de Node en Hostinger. Administración recibe el aviso general; cada restaurante recibe únicamente sus pedidos; los domiciliarios aprobados y disponibles reciben pedidos a domicilio sin asignar. Recogidas y pedidos de mesa no se anuncian a domiciliarios. Los recibos internos de envío permiten reintentar errores transitorios sin repetir envíos ya confirmados. El aviso no sustituye la consulta del estado actual del pedido.

Publicación necesaria (la sincronización de Hostinger no realiza estos pasos):

1. Instalar dependencias de Functions: `npm ci --prefix functions`. La función utiliza Node.js 22 y requiere Cloud Functions habilitado en Firebase.
2. Publicar funciones y reglas: `firebase deploy --only functions:order-notifications,firestore:rules --project studio-9002217802-13e05`. La configuración apunta a la base nombrada `ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15`. Verificar permisos de despliegue y facturación del proyecto antes de ejecutar. No desplegar con `firebase.security.json`, que es exclusivo para pruebas locales.
3. Ejecutar `npm run cap:sync` y generar/firmar una nueva versión Android en Android Studio usando JDK 21 como Gradle JDK. El wrapper actual Gradle 8.14.3 no admite ejecutar la compilación con Java 25. En este equipo está disponible `C:/Users/Usuario/.jdks/jbr-21.0.11`; para la consola, configurar `JAVA_HOME` con esa ruta. El hook `capacitor:sync:after` configura automáticamente el icono y canal en el manifiesto, ya que la carpeta Android es local y no está versionada.
4. Instalar la nueva versión en cada teléfono, abrir el perfil correspondiente y activar notificaciones. Subir la web no actualiza un APK instalado.
5. Prueba manual por perfil con un pedido de prueba autorizado: app abierta, en segundo plano, retirada de recientes (sin forzar detención) y pantalla bloqueada. Comprobar sonido según ajustes del sistema y que tocar el aviso abre el portal correcto. Verificar que un restaurante distinto, un domiciliario no disponible y uno no aprobado no reciben ese pedido. Probar también denegar permiso, reactivarlo desde ajustes y cerrar sesión. Android puede impedir avisos si se fuerza la detención de la app o se restringe su ejecución.

Pruebas locales: `node --test scripts/test-native-order-push.cjs scripts/test-native-push-bridge.cjs scripts/test-background-push.mjs`. Las pruebas usan dispositivos y envíos simulados; no envían mensajes a usuarios reales.

El toque del aviso nativo conserva `pushOrder` hasta que el portal autenticado carga ese pedido y abre su detalle. Solo se resuelven pedidos ya autorizados por las consultas del portal; no se confía en el contenido del aviso como datos del pedido. El ícono pequeño es el chef monocromático extraído del SVG oficial, como requiere Android. Los heads-up y el sonido dependen también de los ajustes del canal, No molestar y las preferencias del fabricante.

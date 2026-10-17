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

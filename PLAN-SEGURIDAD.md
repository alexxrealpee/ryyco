# Plan de seguridad de Firestore — RYYCO

## Fase 1 — solo reglas (`firestore.rules`)

Se puede publicar sin cambiar el código de la app. Cierra:

| Hueco | Antes | Ahora |
|---|---|---|
| Hacerse admin | El dueño de `profiles/{uid}` o `users/{uid}` podía escribirse `role: 'admin'`, y `isAdmin()` lo aceptaba | `isAdmin()` ya no lee `role`. Nadie puede ponerse `role: 'admin'` a sí mismo |
| Auto-activar suscripción | El restaurante podía escribirse `subscriptionStatus: 'active'` o mover `subscriptionPaidUntil` | Solo el admin puede hacerlo |
| Pedidos | Cualquiera podía editar o **borrar** cualquier pedido | Editan el admin, el restaurante dueño y el domiciliario asignado. Un domiciliario aprobado puede tomar un pedido libre. Sin sesión solo se pueden cambiar la calificación y los campos del chat. Borran el admin y el restaurante |
| Pagos de suscripción | Todos públicos, y cualquiera podía aprobarlos | Cada restaurante ve los suyos y no puede aprobarlos |
| Creadores y comisiones | Cualquiera podía crear, editar, borrar o marcar como pagadas | Solo el admin. El público solo suma clics y ventas |
| Historial de RYYCOS | Se podía editar | Ya no se puede editar ni borrar |
| Chats | Abiertos | Mensajes de máximo 1000 caracteres y sin edición de texto. La colección antigua `order_chats` queda solo para el admin |
| Recomendaciones ❤️ | Cualquiera podía borrar las de otros | Solo su autor |

### Antes de publicar

1. Comprueba que todos los administradores están en **Configuración → adminEmails**. Los que eran admin solo por tener `role: 'admin'` en su perfil perderán el acceso.
2. Los admins deben entrar con Google (correo verificado).
3. Prueba en el emulador o en un proyecto de pruebas:
   - un pedido de cliente sin sesión;
   - el restaurante confirma y cancela;
   - el domiciliario acepta, avanza la entrega, libera y reasigna;
   - el cliente califica y usa el chat;
   - un clic en un enlace de referido y un pedido referido;
   - un pago de suscripción (prueba básica);
   - la activación de la suscripción por el admin;
   - dar y quitar ❤️ con sesión y sin ella.
4. Publica con:

```bash
firebase deploy --only firestore:rules --project studio-9002217802-13e05
```

## Fase 2 — requiere cambios en el código

Lo que sigue abierto tras la fase 1, por orden de urgencia:

### 1. Contraseñas de clientes en texto plano (URGENTE)
`customers.password` se guarda tal cual. La colección es de lectura pública y la contraseña se compara en el navegador (`CustomerPortalModal.tsx:604`), así que cualquiera puede descargar todas las contraseñas.
- Deja de guardar `password`. Usa Firebase Auth: Google, que ya está integrado, o un código por SMS/teléfono.
- Borra el campo `password` de todos los documentos con un script de administración (Admin SDK).
- Avisa a los clientes que reutilicen esa contraseña en otros sitios.

### 2. Datos personales de clientes y pedidos públicos
El portal del cliente busca pedidos y su perfil solo con el número de celular, sin sesión. Cualquiera puede leer nombres, teléfonos y direcciones de todos.
- Guarda `customerUid: auth.currentUser.uid` al crear el pedido (`saveOrder`) y en `customers`. Exige sesión antes de pagar.
- Cambia `listenToCustomerOrders` y `fetchCustomerOrders` para filtrar con `where('customerUid', '==', uid)`.
- Cambia `listenToUnassignedOrders`, que hoy escucha **toda** la colección, por `where('status','==','pending')` + `where('deliveryDriverId','==','')`. Para eso, `saveOrder` debe guardar siempre `deliveryDriverId: ''`.
- Con eso la lectura de `orders` puede quedar así: admin, restaurante dueño, domiciliario asignado, el cliente (`customerUid`), y domiciliarios aprobados solo para pedidos libres.

### 3. Saldos de RYYCOS modificables desde el navegador
`transferRyycosByPhone`, la ruleta y los premios cambian saldos desde el cliente. Las reglas no pueden saber si un saldo es correcto.
- Mueve transferencias, premios y ajustes a una Cloud Function o a un endpoint de `server.ts` con Admin SDK.
- Después: `customers` y `ryyco_transactions` con escritura solo para el admin y lectura solo para el dueño.

### 4. Comisiones de referidos falsificables
Hoy el navegador calcula la comisión y suma los totales del creador. Muévelo a la función `orderPush` (trigger `onCreate` de `orders`), que ya existe, y quita esos permisos públicos de `creators` y `referral_commissions`.

### 5. Montos del pedido
`totalAmount` lo calcula el navegador. Valídalo en el servidor (por ejemplo, en el trigger de `orders`) y marca los pedidos que no coincidan.

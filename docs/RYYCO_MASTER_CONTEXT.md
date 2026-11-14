# Contexto maestro RYYCO — Rico / RYYCO Neural / Westin

**Fecha de consolidación:** 2026-11-11  
**Naturaleza:** contexto operativo y hoja de ruta para Codex/Antigravity y colaboradores.  
**Regla fundamental:** separar requisitos conversados de funciones implementadas; el repositorio y Firebase en producción deben verificarse.  
**Instrucciones del agente:** consultar [../AGENTS.md](../AGENTS.md).

## 1. Identidad y visión

- **RYYCO / Rico:** ecosistema gastronómico local con base en Ipiales, Nariño, Colombia.
- **Sitio:** https://ryyco.com.
- Participantes: consumidores, propietarios/administradores de restaurantes, domiciliarios independientes, administradores generales y, como expansión prevista, proveedores de insumos exclusivamente B2B.
- Posicionamiento: «No somos una plataforma de domicilios; somos un ecosistema gastronómico. El domiciliario es solo un módulo».
- Meta: facilitar descubrimiento, compra, preparación, entrega, operación, abastecimiento y mejora continua de restaurantes, sin sacrificar confiabilidad.

### Resultados que importan

1. **Más ventas sostenibles:** clientes encuentran lo que realmente desean; restaurantes reciben pedidos completados y rentables.
2. **Entregas confiables y rápidas:** poca espera para asignación y recogida, ETA razonables, menos cancelaciones y reclamos.
3. **Menos desperdicio:** mejor control de ingredientes, empaques, demanda, caducidad y preparación.
4. **Innovación gastronómica:** propuestas originales de platos basadas en preferencias, costos, inventario y experimentación real.
5. **Abastecimiento empresarial:** proveedores conectados con responsables de compras de los restaurantes.
6. **Seguridad y transparencia:** claridad sobre cobro, confirmación, responsabilidades y atención a incidentes.

## 2. Sistema actual: inspección del repositorio

Repositorio: https://github.com/alexxrealpee/ryyco (revisado el 2026-11-11).
- React, TypeScript, Vite, Node.js/Express, Firebase/Firestore, FCM, Capacitor para Android.
- `server.ts` y `server/`: backend, APIs, catálogo, voz y notificaciones.
- `src/lib/firebase.ts`: perfiles, productos, pedidos, transacciones, domiciliarios.
- `src/components/AdminPanel.tsx`: administración y pedidos.
- `src/components/DriverPortal.tsx`: módulo del domiciliario.
- `src/components/AdminDriversManager.tsx`: gestión de conductores.
- `src/components/AdminDriversMap.tsx`: mapa de disponibilidad GPS.
- `src/hooks/useDriverPresence.ts`: posición, heartbeat condicionado y presencia.
- `src/lib/whatsappDriverNotifications.ts`: mensajes de WhatsApp y filtro de disponibles.
- `src/lib/orderTimeTracking.ts`: estados y tiempos.
- `src/lib/deliveryTrackingService.ts`: rastreo del pedido.
- `src/components/RestaurantSalesStats.tsx`, `src/components/AdminSalesStats.tsx`: estadísticas.
- `src/components/ProductRecommendationHeartButton.tsx`: feedback de productos.
- `server/orderPush.ts`: notificaciones de pedidos.
- `server/catalogManager.ts`: catálogo y datos de tienda.

Estas referencias no implican que todas las funciones comerciales propuestas estén lanzadas. Confirmar estado por rama, despliegue, entornos y registros reales.

## 3. Incidencias operativas: prioridad máxima

### 3.1 Disponibilidad de domiciliarios
El fundador comunicó aproximadamente **34 domiciliarios registrados y 20 activos**; **NO es un dato verificado de Firebase en tiempo real**. El problema reportado es que a veces todos se desconectan o marcan no disponible, dejando pedidos pendientes.

Distinguir al menos estos conteos en administración:
- Total de perfiles registrados.
- Aprobados, pendientes, suspendidos y rechazados.
- Interruptor de disponibilidad activo.
- Presencia de app/conexión recientemente confirmada.
- Ubicación GPS reciente (con su propia métrica).
- Domiciliarios realizando entrega.
- Domiciliarios elegibles y libres para aceptar una nueva asignación.
- Tasa de aceptación, tiempo hasta asignación, cobertura horaria, pedidos sin asignación.

Código observado:
- `AdminDriversManager.tsx` cuenta `isAvailable`; no basta para determinar disponibilidad real.
- `whatsappDriverNotifications.ts` filtra `status === 'approved'`, `isAvailable` e `isOnline !== false`. Esto no garantiza conexión reciente.
- `AdminDriversMap.tsx` sí combina información de `driver_presence` y `delivery_tracking` y comprueba frescura de GPS.
- `server/orderPush.ts` distribuye FCM entre conductores aprobados con disponibilidad activada y token registrado, sin confirmar por sí mismo que aceptarán.
- Conductores controlan voluntariamente su disponibilidad: no activarlos por la fuerza.

### 3.2 Carrera entre restaurante y conductor
- `listenToUnassignedOrders` en `src/lib/firebase.ts` busca pedidos `pending` sin conductor.
- El `DriverPortal` filtra explícitamente `pending`.
- Esto puede excluir pedidos aún sin asignar cuando el restaurante los pasa a `processing` (o a otro estado confirmado). **Hipótesis a comprobar contra registros reales.**
- Separar **estado comercial/cocina** de **estado de despacho**, y conservar transacciones atómicas.

### 3.3 Clientes o restaurantes sin respuesta
Problemas comunicados:
- Restaurante recibe pedido pero no responde o no confirma.
- Domiciliario se desplaza a restaurante y descubre que el cliente ya no contesta.
- Cliente deja de responder al momento de entrega, o no recibe la comida.
- Pedido se queda en espera y se deteriora experiencia del cliente.

Flujo propuesto, todavía no necesariamente implementado:
1. Pedido solicitado, con teléfono y dirección validados.
2. Confirmación de restaurante y disponibilidad del producto.
3. Verificación del pago por el restaurante o acuerdo de pago explícito; una foto de comprobante no equivale a dinero confirmado.
4. Confirmación de cliente/entrega cuando sea necesaria, y aceptación real del domiciliario.
5. Inicio de preparación coordinado con tiempos realistas de despacho.
6. Recogida y salida, rastreo y notificaciones.
7. Entrega verificada con PIN/código existente; si hay incidencia, protocolo de contactos, devolución y resolución humana.

Las verificaciones se pueden realizar en paralelo cuando sea seguro, para no aumentar tiempos inútilmente. No exigir confirmaciones excesivas a usuarios ya autenticados si existen pruebas suficientes y reglas aprobadas.

### 3.4 Plazos y contingencias
**Parámetros a probar, no reglas obligatorias:**
- Alertar si un pedido no recibe respuesta o no encuentra domiciliario después de unos minutos (p. ej. 2–5 min según horario).
- Detectar restaurante sin respuesta, conductor no disponible, cliente sin contacto y exceso de ETA.
- Escalar a administración con opciones de reasignación, recogida por cliente, reparto propio o reprogramación aceptada.
- Explicar al cliente las alternativas ANTES de comprometer una entrega si no hay capacidad.
- No cancelar pedidos pagados ni prometer reembolsos automáticos sin protocolo validado.
- Documentar responsabilidades, historial y reintentos idempotentes para evitar notificaciones repetidas.

## 4. Proceso de pago y notificación

Flujos comunicados:
- Transferencia manual a la cuenta publicada por el restaurante (Nequi/Bancolombia u otros) con comprobante subido a la plataforma; el restaurante debe validar su recepción.
- Coordinación de pago por WhatsApp directamente entre cliente y restaurante, con acuerdo registrado cuando corresponda.
- El domiciliario llama al restaurante, comprueba que el pago fue confirmado y coordina recogida; reporta eventualidades.
- El equipo indicó una tarifa urbana base de **COP $7.000** para domicilio en Ipiales; verificar configuración y excepciones.
- El equipo comunicó que el cliente paga directamente al restaurante, y este paga el domicilio al domiciliario; verificar escenarios concretos, incluyendo domicilio gratis y contraentrega.

**Conflicto técnico detectado:** `buildDriverOrderWhatsAppMessage` en `src/lib/whatsappDriverNotifications.ts` incluye instrucción de llevar efectivo para pagar comida, posiblemente incompatible con la operativa reciente. Auditar mensajes generados por código y plantillas personalizadas. No cambiar modalidades sin autorización.

**Propuesta de monetización NO confirmada:** recargas de saldo de conductores en cantidades de 10.000, 20.000, 30.000 y 40.000 COP y cobro del 10 % por servicio. Mantenerlo como decisión pendiente y no deducir dinero hasta aprobar reglas, controles y liquidación.

Notificaciones actuales: WhatsApp a restaurante y grupo de conductores como mecanismo operativo comunicado; FCM y portal de conductor en el código. El WhatsApp grupal puede ser canal de aviso, pero nunca única fuente de estado. No exponer datos sensibles en mensajes grupales.

## 5. RYYCO Neural: visión del sistema de inteligencia

No es un modelo único «que se reentrena solo». Es una plataforma de agentes, memoria de resultados, modelos predictivos y reglas operativas deterministas.

### 5.1 Inteligencia comercial / recomendación
Señales posibles (con privacidad y consentimiento):
- Productos buscados, vistos, guardados, agregados al carrito y comprados.
- Ventas completadas y no solo clics.
- Reseñas, repetición de compra, preferencias expresadas y disponibilidad del restaurante.
- Día, hora, rango de precio, demanda y distancia/tiempo estimado.

Objetivos: elevar conversión, repetición de compra y satisfacción, sin impulsar productos agotados ni restaurantes cerrados. Separar experimentos de recomendaciones comerciales y resultados observados.

### 5.2 Innovación gastronómica
El agente propone recetas originales combinando demanda agregada, inventario real, cultura gastronómica, costos, margen y equipamiento de cocina. Cada propuesta debe:
- Indicar nombre, ingredientes, cantidades, alérgenos, pasos, costo estimado, tiempo y precio hipotético.
- Ser claramente propuesta; ni sabor ni demanda están probados por una imagen.
- Requerir validación de ingredientes y seguridad alimentaria por el restaurante.
- Permitir prueba piloto limitada autorizada y recoger tasa de compra, aceptación, merma y recompra.
- No publicar platillos ni comprar ingredientes automáticamente.

### 5.3 Inteligencia logística
Entradas: tiempos de aceptación, preparación, recogida, viaje, cancelaciones, GPS reciente (minimizado), zonas y oferta de conductores.
Salidas: predicción de demanda por franja, ETA con incertidumbre, recomendación de conductores elegibles y alertas tempranas.
Métricas: tasa de entrega completa, espera hasta asignación, tiempo total, reclamos y costo operativo. Nunca sustituir validaciones de pago o de entrega por una predicción.

### 5.4 Inventarios y desperdicios
El restaurante debe poder registrar reposiciones pequeñas a medida que compra, no únicamente cierres de inventario de fin de semana.
- Unidades adecuadas a insumo: g/kg, ml/l y unidades, con conversión normalizada y sin forzar todos los artículos a gramos.
- Registrar empaques, cubiertos, recipientes, servilletas, vasos y demás consumibles.
- Fichas técnicas/recetas con rendimiento, merma, equivalencias y caducidad.
- Predicción de demanda + inventario disponible + mínimos y vencimientos -> sugerencia de compra/preparación.
- Medir merma observada; sin medición, una predicción de ahorro no es un ahorro real.

## 6. Proveedores — B2B solamente

Objetivo: proveedores vendan productos e insumos **únicamente a propietarios y administradores de restaurantes autorizados**. NO habilitar venta B2C.
Funciones propuestas:
- Registro, verificación y administración de proveedor, su catálogo, unidad de venta, precio, stock, plazos y zonas.
- Autorización por rol y relación con restaurante (backend + Firestore Rules).
- Comparación informada de insumos, historial de compra, pedidos y recepción.
- Reposición sugerida mediante inventario y demanda.
- Compras/transferencias confirmadas por persona autorizada.
- Privacidad comercial entre proveedores y restaurantes: no compartir ventas, recetas ni márgenes individuales sin autorización.

## 7. Westin / RYYCO LIVE — proyecto relacionado

Avatar virtual de TikTok con conversaciones naturales, voz OpenAI **Cedar**, sincronización de labios y personalidad divertida/pícara. Se propuso un sistema de aprendizaje local mediante Node.js + SQLite para medir participación y adaptar estrategias sin entrenar de cero un modelo.
No confundir métricas de participación con retención real si TikTok no la provee.
No modificar voz, diseño, rostro ni animaciones en tareas del ecosistema gastronómico.
El contexto de Westin puede inspirar arquitectura de memoria, pero los datos y permisos se mantienen segregados.

## 8. Diseño y marca
- Logo RYYCO oficial: tipografía «ryyco» en minúsculas, segmentos blanco/amarillo, elementos y gorro de chef; respetar archivo original.
- Colores: rojo `#E63946`, amarillo `#F4B400`, noche `#090B12`, blanco `#FFFFFF`.
- Prefiere superficies planas, claridad visual, rapidez móvil, compatibilidad Android/PWA. No cambiar marca o colores sin solicitud.
- Producto con foco en Ipiales; planes de expansión territorial, no asumir cobertura nacional.

## 9. Arquitectura futura: hipótesis inicial
- Firebase / Firestore permanece como fuente de verdad operativa mientras no se apruebe una migración.
- Node.js aloja servicios seguros para diagnóstico/analítica/IA sin exponer credenciales.
- SQLite puede servir como memoria de experimentación local; no poner la operación crítica 24/7 bajo dependencia de un computador personal que puede apagarse.
- OpenAI para razonamiento, síntesis e ideación; estadísticas y reglas deterministas para seguridad y estados.
- TensorFlow.js u otro aprendizaje supervisado solo cuando haya datos de entrenamiento representativos y evaluaciones confiables.
- Codex/Antigravity pueden generar código y pruebas en rama aislada. Publicación a producción y operaciones sensibles requieren aprobación.
- Eventual integración directa con ChatGPT a través de herramientas privadas read-only autenticadas; NO publicar Firestore sin autenticación ni compartir credenciales por chat.

## 10. Plan de acción recomendado

**P0: Diagnóstico sin escritura**
- Consultar agregados reales de `drivers`, `driver_presence`, `orders` y FCM sin extraer identificadores personales.
- Calcular números de aprobados, online según heartbeat, GPS reciente, libres, ocupados, sin asignación y tiempos estancados.
- Verificar la hipótesis de pedidos que desaparecen por cambio `pending` -> `processing`.
- Auditar mensajes de WhatsApp y reglas actuales de pagos.

**P1: Fiabilidad de pedidos**
- Separar estado de cocina, pago, contacto y despacho, con compatibilidad hacia atrás.
- Alertas de ausencia de conductores, confirmación y recepción; supervisión humana.
- Test de transiciones, idempotencia, reasignación y concurrencia.

**P2: Despacho / métricas**
- Predicción básica de tiempo de asignación y disponibilidad; métricas de SLA por franja y restaurante.
- Mejorar notificaciones y transparencia de ETA con datos observados.

**P3: Inventarios + proveedores**
- Entrada rápida de insumos y consumibles, fichas técnicas y consumo por receta.
- Catálogo B2B con seguridad por rol y reposición sugerida.

**P4: Recomendaciones + creación de platos**
- Capturar señales con privacidad; medir incremento real de ventas y desperdicio.
- Generar propuestas de platos y experimentos de bajo riesgo.

## 11. Preguntas de negocio pendientes
- ¿Qué significa exactamente «activo» en el panel de domiciliarios: aprobado, interruptor encendido o conexión reciente?
- ¿Cuál es el protocolo aprobado cuando no hay conductor, restaurante o cliente sin respuesta?
- ¿En qué instante puede comenzar la preparación según modalidad de pago y capacidad de reparto?
- ¿Cuál es el flujo real de pagos y comisiones hoy frente a propuestas anteriores?
- ¿Los restaurantes asumirán domicilio gratis con repartidor propio o RYYCO, y quién paga la tarifa?
- ¿Qué autorizaciones tendrán proveedores y administradores delegados?
- ¿Qué datos de inventario, caducidad y desperdicio son medibles hoy?

## 12. Cómo usar este archivo
Codex debe citar los módulos examinados y explicar si una afirmación es:
- **Confirmada en código** (con ruta/función).
- **Comunicada por negocio** (pendiente de contraste en producción).
- **Hipótesis** (necesita datos).
- **Propuesta** (no implementar sin requerimiento específico).

No introducir datos numéricos de ejemplo como si fueran resultados reales de Firebase. Se espera evolución de este documento mediante PR revisados.

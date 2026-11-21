# RYYCO / Rico — Instrucciones para agentes de programación

Actualizado: 2026-11-11. Idioma operativo: español (Colombia).
Repositorio: https://github.com/alexxrealpee/ryyco

## 0. Lectura obligatoria
- Antes de modificar código, leer este archivo y [docs/RYYCO_MASTER_CONTEXT.md](docs/RYYCO_MASTER_CONTEXT.md).
- Tratar los hechos identificados como «confirmados en repositorio» de forma distinta de los objetivos, hipótesis, decisiones pendientes y cifras comunicadas por el equipo.
- Este archivo complementa las instrucciones del usuario, no reemplaza una solicitud explícita. Si hay contradicción con el código actual, investigar y explicar antes de modificar.
- No asumir que Codex tiene acceso automático a conversaciones anteriores de ChatGPT.

## 1. Qué es RYYCO
RYYCO (Rico, ryyco.com) es un ecosistema gastronómico local iniciado en Ipiales, Nariño, Colombia. NO reducir el producto a una app de domicilios: hay clientes, restaurantes, domiciliarios, administración y un futuro portal B2B para proveedores.

Objetivos del negocio:
1. Ayudar a los restaurantes a vender más y conocer las preferencias gastronómicas de los clientes.
2. Reducir el tiempo y la incertidumbre de las entregas.
3. Reducir desperdicio de alimentos mediante mejores inventarios y previsión.
4. Proponer recetas/platos nuevos basados en datos reales y someterlos a aprobación y pruebas.
5. Conectar proveedores EXCLUSIVAMENTE con propietarios o administradores autorizados de restaurantes.

## 2. Prioridad de fiabilidad operativa
El objetivo inmediato no es sumar funciones por sumar: impedir pedidos abandonados, entregas tardías, clientes que no responden, pagos no verificados y restaurantes sin respuesta.

En cada cambio de pedidos, preservar y distinguir por separado:
- Confirmación del cliente y posibilidad real de recibir el pedido.
- Confirmación del restaurante, disponibilidad de productos y tiempo de preparación.
- Confirmación del pago: recibo adjunto ≠ dinero efectivamente recibido.
- Asignación efectiva del domiciliario y tiempo estimado.
- Preparación, recogida, desplazamiento y entrega verificada.
- Escalamiento, reintentos, cancelación o incidencia con trazabilidad.

No marcar «entregado» por GPS o por proximidad; conservar el código de entrega/validación existente. Prevenir doble aceptación, doble cobro, pérdida de pedido y estados incongruentes. No crear una dependencia de WhatsApp como única vía de confirmar un pedido.

## 3. Arquitectura y código existente
Según el repositorio revisado el 2026-11-11:
- Frontend: React + TypeScript + Vite.
- Backend: Node.js + Express en server.ts y módulos server/.
- Datos operativos y autenticación: Firebase / Firestore.
- App móvil: Capacitor (Android).
- Notificaciones: Firebase Cloud Messaging; integraciones de WhatsApp existentes.
- Código relevante:
  - src/lib/firebase.ts: operaciones de datos, perfiles, pedidos y conductores.
  - src/components/DriverPortal.tsx: vista del domiciliario.
  - src/components/AdminDriversManager.tsx: gestión administrativa de conductores.
  - src/components/AdminDriversMap.tsx: ubicaciones y mapa.
  - src/hooks/useDriverPresence.ts: telemetría de disponibilidad/GPS.
  - src/lib/whatsappDriverNotifications.ts: plantillas WhatsApp.
  - src/lib/orderTimeTracking.ts: estados y tiempos.
  - src/lib/deliveryTrackingService.ts: seguimiento de entregas.
  - src/components/RestaurantSalesStats.tsx: estadísticas de ventas.
  - src/components/ProductRecommendationHeartButton.tsx: valoraciones de productos.
  - server/orderPush.ts: push de pedidos.
  - server/catalogManager.ts: catálogo.
- No asumir que funciones nuevas propuestas en conversaciones ya están implementadas. Verificar el código antes de citar una función como existente.

## 4. Alertas técnicas conocidas (investigar, no corregir a ciegas)
1. El contador de «disponibles» del panel se basa en isAvailable; eso no garantiza conexión reciente, ausencia de pedido activo, GPS vigente ni token push funcional.
2. La lista de pedidos sin asignar filtra status === 'pending'; al pasar el restaurante a «Procesando», un pedido sin domiciliario podría dejar de ofrecerse. Separar estado de cocina y de asignación mediante diseño compatible y migración segura.
3. La plantilla predeterminada de WhatsApp para domiciliarios todavía menciona llevar efectivo al restaurante. Contrasta con el flujo operativo comunicado por el equipo: el cliente paga directamente al restaurante y el domiciliario verifica el pago y cobra la tarifa de entrega al restaurante. Revisar variantes y plantillas personalizadas.
4. El estado isOnline puede ser opcional; no inferir conectividad real de un booleano sin heartbeat o telemetría reciente.
5. Inspeccionar transacciones, estados y controles de concurrencia antes de introducir despacho o reintentos automáticos.

## 5. Pagos, cobros y estados: no inventar reglas
- Tarifa urbana comunicada: COP $7.000 por domicilio; verificar la configuración activa y excepciones.
- El equipo ha hablado de un esquema de recargas y comisión del 10% a domiciliarios, pero debe tratarse como PROPUESTA/PENDIENTE hasta verificar su implantación y aprobación; no cambiar saldos ni cobros automáticamente.
- Existe modalidad de transferencia manual con comprobante y modalidad coordinada por WhatsApp. No equiparar «comprobante subido» o «mensaje enviado» a «pago confirmado».
- Los restaurantes pueden ofrecer domicilio gratis; revisar quién realiza la entrega y no generar solicitudes incompatibles.
- Evitar automatizar devoluciones, descuentos, precios o liquidaciones sin reglas aprobadas, auditoría y controles.
- No exponer en notificaciones de grupos datos personales innecesarios del cliente.

## 6. IA / RYYCO Neural: diseño propuesto, no implementación actual
El equipo desea un motor que:
- Recomiende productos/restaurantes relevantes de forma medible.
- Prediga demanda, tiempos de cocina, disponibilidad de conductores y riesgo de retraso.
- Ayude con insumos, mermas, empaques y compras B2B.
- Genere propuestas de platos/recetas con cantidades, alérgenos, costos y márgenes, siempre sujetas a validación del restaurante y pruebas reales.
- Aprenda de resultados: pedido completado, cancelación, tiempo de entrega, venta, repetición de compra, desperdicio y satisfacción.
- Investigue mejoras y prepare código/pruebas en ramas aisladas, SIN desplegar a producción por cuenta propia.

No hace falta TensorFlow para comenzar. Priorizar reglas confiables, métricas, memoria y evaluación; solo entrenar modelos predictivos cuando haya datos suficientes. El LLM no debe reemplazar la máquina de estados transaccional del pedido.

## 7. Proveedores B2B e inventarios
- El catálogo y compra de proveedores es solo para cuentas autorizadas de propietario o administrador de restaurante. Aplicar autorización en backend y reglas de datos, nunca solo ocultar botones.
- Los clientes consumidores no pueden ver ni comprar el catálogo B2B.
- El restaurante compra insumos cuando se agotan, no solo en grandes compras periódicas; permitir entradas rápidas y parciales por peso, volumen o unidad y registrar costo/fecha/caducidad cuando corresponda.
- Incluir ingredientes y consumibles: empaques para llevar, recipientes, cucharas, vasos, servilletas, etc. Diferenciar materia prima, producto terminado y consumibles.
- La IA puede sugerir pedidos a proveedores, pero nunca realizar compras o transferencias sin confirmación del restaurante.

## 8. Identidad de marca e interfaz
- Marca: «RYYCO» y experiencia de consumo «Rico».
- Paleta principal: rojo #E63946, amarillo #F4B400, fondo oscuro #090B12, blanco #FFFFFF.
- Diseño preferido: colores planos, sin degradados/sombras fuertes innecesarias.
- No deformar ni reinterpretar el logotipo oficial; respetar las fuentes gráficas existentes.
- Mantener accesibilidad, rendimiento en móvil y flujos actuales. Evitar rediseños que cambien funcionalidad sin consentimiento.
- Para Westin (avatar de LIVE, proyecto relacionado pero distinto), no tocar voz Cedar, rostro, lip-sync o personalidad si una solicitud no lo requiere expresamente.

## 9. Seguridad, privacidad y despliegues
- Proteger datos de compradores, domicilios, geolocalizaciones, comprobantes, documentos de identidad y credenciales.
- No copiar claves privadas, tokens, cuentas de servicio o datos de clientes a GitHub, logs, prompts, documentación, capturas o frontend. No cambiar permisos de Firestore para «facilitar» una consulta.
- Respetar reglas de acceso por rol (cliente, restaurante, administrador, domiciliario, proveedor).
- Para análisis estadístico, preferir agregados y seudónimos. Minimizar datos, restringir retención y acceso.
- Desarrollar de forma incremental. Validar tipos, pruebas, compilación, estados límite y experiencia móvil.
- Ejecutar pruebas de lectura/escritura contra emulador o entorno de pruebas; nunca crear pedidos, cobros o notificaciones reales en producción para probar.
- No desplegar, migrar, borrar datos, activar campañas, enviar WhatsApp masivos ni modificar saldos sin autorización explícita.

## 10. Protocolo de trabajo de Codex
1. Identificar el objetivo de negocio y cómo se medirá (ej.: tiempo hasta asignación, pedidos entregados, tasa de cancelación).
2. Inspeccionar archivos reales, dependencias, reglas Firestore, datos/esquemas y comportamiento previo.
3. Explicar la causa raíz, los riesgos y una propuesta pequeña, reversible y comprobable.
4. Hacer cambios mínimos en rama separada y presentar diff y pruebas.
5. Reportar cambios que requieran migración o nuevas variables de entorno, sin revelar secretos.
6. Mantener un registro en documentación de decisiones aprobadas, hipótesis y resultados. Nunca inventar cifras de Firebase.
7. Cuando falten datos reales, decir «no verificado» y proponer consulta de solo lectura.
8. Al finalizar, resumir qué cambió, qué NO se cambió, pruebas ejecutadas y pasos manuales para aprobar.

## 11. Fuentes y vigencia
El contexto funcional y las propuestas se detallan en docs/RYYCO_MASTER_CONTEXT.md. Las declaraciones de negocio provienen de conversaciones del equipo y deben contrastarse con la configuración actual; los apuntes de código reflejan la revisión del 2026-11-11.
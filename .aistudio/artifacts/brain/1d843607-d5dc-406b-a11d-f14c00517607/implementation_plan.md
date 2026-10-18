# Plan de Implementación: Ordenamiento Superior y Carga Inteligente de Pedidos en Administración

Este plan describe las modificaciones técnicas para garantizar que en el panel de **Administración General**, el último pedido que llegue se posicione siempre en la parte superior y se implemente una carga inteligente de 6 pedidos iniciales con carga progresiva automática mediante scroll infinito.

---

## 1. Contexto y Objetivos

- **Posicionamiento Superior del Pedido Más Reciente**:
  - Asegurar que la lista de pedidos se ordene estrictamente de forma descendente por fecha de creación (`createdAt` más reciente primero) y número de orden (`orderNumber` descendente como respaldo).
  - Cuando ingrese un nuevo pedido en tiempo real a través del listener de Firebase, este aparecerá inmediatamente en la primera posición de la lista.

- **Carga Inteligente de 6 en 6 (Infinite Scroll)**:
  - Inicializar la vista mostrando exclusivamente los **6 primeros pedidos**.
  - Al hacer scroll hacia abajo y llegar al final del listado visible, cargar de forma automática los siguientes 6 pedidos mediante un centinela con `IntersectionObserver`.
  - Restablecer la cantidad visible a 6 cuando el usuario aplique o cambie filtros de búsqueda (por tienda, estado o texto).

- **Conservación de Métricas Globales**:
  - Mantener los contadores superiores de la plataforma (Pendientes, Entregados, Total acumulado) reflejando el total global en tiempo real de Firebase sin verse truncados por la paginación visual de 6 elementos.

---

## 2. Cambios a Realizar

### Archivo: `src/components/AdminPanel.tsx`

1. **Ordenamiento Estricto de Pedidos**:
   - En el `useMemo` de `filteredOrders`, aplicar una ordenación explícita `createdAt` descendente:
     ```typescript
     .sort((a, b) => {
       const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
       const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
       if (timeB !== timeA) return timeB - timeA;
       return (b.orderNumber || 0) - (a.orderNumber || 0);
     });
     ```
   - Esto garantiza que sin importar el orden en que Firebase entregue los documentos o actualizaciones, el último pedido creado siempre esté en la parte superior absoluta.

2. **Ajuste del Lote Inicial y Crecimiento Progresivo**:
   - Modificar el estado inicial de `visibleOrdersCount` de 20 a **6**.
   - Al cambiar los filtros de tienda, estado o término de búsqueda, resetear `setVisibleOrdersCount(6)`.
   - Modificar el `IntersectionObserver` para que incremente la visualización en lotes de **6 pedidos**:
     ```typescript
     setVisibleOrdersCount(prev => Math.min(prev + 6, filteredOrders.length));
     ```

3. **Indicador de Carga y Centinela de Scroll**:
   - Asegurar que el centinela `<div ref={ordersSentinelRef} />` cuente con un margen de detección adecuado (`rootMargin: '160px'`).
   - Mostrar un indicador visual sutil de carga ("Cargando más pedidos...") mientras haya pedidos adicionales pendientes por desplegar en la vista.

---

## 3. Plan de Verificación

1. **Prueba de Ordenamiento**:
   - Verificar que los pedidos con fecha/hora más reciente se ubiquen en el primer lugar de la tabla/lista.
2. **Prueba de Lote Inicial**:
   - Confirmar que al abrir la pestaña de "Pedidos" en Administración se muestren únicamente los primeros 6 pedidos.
3. **Prueba de Scroll Infinito**:
   - Desplazar la vista hacia abajo y comprobar que se revelen de 6 en 6 de forma fluida sin parpadeos ni bloqueos.
4. **Prueba de Filtros y Métricas**:
   - Cambiar los filtros de tienda y estado, comprobando que se reseteen a 6 pedidos y que los contadores globales (Pendientes, Entregados) continúen reflejando las cifras exactas.
5. **Compilación y Linteo**:
   - Ejecutar `compile_applet` y `lint_applet` para garantizar cero errores de tipos o compilación.

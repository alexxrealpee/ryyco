# Optimización de la Sección de Logotipos de Restaurantes RYYCO

Optimización integral del carrusel de logotipos de restaurantes en la página principal para mostrar única y exclusivamente los restaurantes abiertos en tiempo real mediante un listener de Firestore eficiente, eliminando el almacenamiento en caché persistente para el estado operativo y preservando la caché de imágenes de logotipos y el diseño visual actual.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> A continuación se resumen las decisiones acordadas a partir de las preguntas de clarificación:

- **Detección en tiempo real (Confirmado)**: Se utilizará un listener instantáneo con `onSnapshot` de Firebase Firestore en la colección de perfiles de restaurantes, asegurando que cualquier cambio de apertura/cierre o suspensión se refleje de inmediato en la interfaz sin necesidad de recargar la página.
- **Sin caché persistente de estado (Confirmado)**: Se elimina cualquier lectura o escritura del estado abierto/cerrado en `localStorage` o `sessionStorage`, garantizando que ningún restaurante que haya cerrado recientemente aparezca abierto por error al ingresar a la plataforma.
- **Caché de imágenes de logotipos activa (Confirmado)**: Se mantiene la precarga en memoria y el aprovechamiento de la caché HTTP del navegador para las URLs de los logotipos, evitando parpadeos visuales y descargas innecesarias al actualizar el listado.
- **Consumo mínimo de Firebase (Confirmado)**: Se centraliza la consulta en una única suscripción reactiva optimizada, eliminando solicitudes duplicadas o periódicas redundantes.
- **Preservación total del diseño (Confirmado)**: El diseño, botones de navegación (< y >), auto-scroll suave, botón "Todos", botón "Recomendados (Reels)", punto verde pulsante y animaciones permanecen 100% idénticos al estado actual.

---

## 1. Overview & Core Concept

- **Qué hace**: Asegura que la barra de logotipos de restaurantes de RYYCO muestre en todo momento de manera fidedigna los comercios gastronómicos en servicio activo. Cuando un restaurante abre, aparece al instante; si un restaurante cierra o suspende su servicio, desaparece de inmediato del carrusel.
- **Audiencia objetivo**: Clientes y comensales que acceden a la tienda general de RYYCO y desean explorar únicamente locales disponibles para realizar pedidos al instante.
- **Valor clave**: Evita pedidos fallidos en locales cerrados, elimina inconsistencias derivadas de datos en caché obsoletos y maximiza la velocidad de carga inicial manteniendo un consumo eficiente y controlado de lecturas en Firebase.

---

## 2. User Experience & Visual Design

- **Flujo de Usuario al Ingresar**:
  1. El cliente ingresa a la tienda general de RYYCO.
  2. La aplicación establece de forma inmediata la consulta/escucha reactiva a Firebase para obtener los perfiles activos.
  3. Los restaurantes abiertos se calculan al instante evaluando: `isClosed !== true`, `suspended !== true`, estado de suscripción vigente y validación de horarios configurados (`checkIsStoreClosed`).
  4. Los logotipos se renderizan con sus imágenes cacheadas en el navegador; si no tienen imagen, se muestran las iniciales con el estilo de marca RYYCO.
  5. En caso de que un restaurante cambie su estado en Firebase (abrir/cerrar), la lista se reajusta dinámicamente y con fluidez en pantalla.
  6. Si todos los restaurantes estuviesen cerrados temporalmente, se muestra el banner informativo sutil ya existente sin romper la estructura de la página.

- **Diseño Visual e Interactividad**:
  - **Identidad visual**: Fondo oscuro característico de la plataforma (`slate-900`/`slate-950`), bordes sutiles, acentos de color rojo RYYCO (`#D62839`) y punto verde esmeralda pulsante (`emerald-500`) indicando servicio activo.
  - **Controles de desplazamiento**: Carrusel con soporte táctil, arrastre con ratón (mouse drag) y botones de navegación izquierda/derecha.
  - **Interacción por clic**: Al pulsar sobre el logotipo de un restaurante, se filtran sus productos específicos o se deselecciona para volver a "Todos".

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Escucha reactiva con `onSnapshot` vs. Consultas manuales recurrentes**
  - *Enfoque elegido*: Conexión directa mediante `onSnapshot` sobre los perfiles de comercios.
  - *Por qué*: Ofrece actualización en tiempo real instantánea (< 200 ms) sin generar tráfico constante por sondeo (polling), consumiendo lecturas únicamente cuando hay cambios reales en los documentos.
  - *Alternativas descartadas*: `setInterval` con llamadas a `getDocs` cada pocos segundos, lo cual dispara exponencialmente la cuota y costo de Firebase.

- **Decisión 2: Supresión estricta de caché persistente de estado**
  - *Enfoque elegido*: No persistir `openRestaurants` ni `profiles` en `sessionStorage` o `localStorage`.
  - *Por qué*: Si un usuario visitó la página a las 11:00 AM y regresa a las 11:30 AM cuando un restaurante cerró, una caché persistente mostraría falsamente el restaurante como abierto hasta que la sincronización termine. La consulta directa a Firebase garantiza verosimilitud inmediata desde el primer render.
  - *Alternativas descartadas*: Caché con tiempo de vida (TTL), ya que cualquier ventana de tiempo puede mostrar un comercio cerrado como abierto.

- **Decisión 3: Separación entre caché de estado operativo y caché de activos gráficos (imágenes)**
  - *Enfoque elegido*: Desvincular la información de apertura (que siempre viene en vivo de Firebase) del recurso visual de la imagen (que se mantiene en memoria y en la caché HTTP nativa del navegador mediante precarga `new Image()`).
  - *Por qué*: Al abrirse un restaurante o reordenarse la lista, la imagen del logotipo aparece al instante sin parpadeos blancos ni re-descargas de red.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   Firebase Firestore                   │
│                  Colección 'profiles'                  │
└───────────────────────────┬────────────────────────────┘
                            │ onSnapshot (Live Stream)
                            ▼
┌────────────────────────────────────────────────────────┐
│              useProgressiveStoreLoader                 │
│  - Sin caché persistente de estado (no sessionStorage) │
│  - Filtro estricto: !isClosed && !suspended && horario │
│  - Actualización reactiva instantánea                  │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│   Caché de Imágenes en    │ │     TiendaGeneral UI     │
│  Memoria / HTTP Browser   │ │  - Carrusel de logotipos │
│  - Preload sin parpadeo   │ │  - Botón "Todos"         │
│  - Reutilización instant  │ │  - Botón "Recomendados"  │
└───────────────────────────┘ └──────────────────────────┘
```

- **Modelo de Filtrado de Abiertos**:
  ```ts
  const isOpen = 
    !profile.isClosed && 
    !profile.suspended && 
    profile.subscriptionStatus !== 'suspended' && 
    profile.subscriptionStatus !== 'expired' && 
    !checkIsStoreClosed(profile) && 
    (profile.displayName || profile.username);
  ```

- **Componentes involucrados**:
  1. `src/hooks/useProgressiveStoreLoader.ts`: Limpieza de inicialización basada en almacenamiento local/sesión para estados de tienda; conexión única y optimizada a `onSnapshot` con actualización atómica de `openRestaurants`.
  2. `src/components/TiendaGeneral.tsx`: Retiro de residuos de caché de sesión para el estado de perfiles; integración con la lista en vivo; mantenimiento de la caché y precarga de logotipos en el navegador; preservación estricta de la estructura visual del carrusel.

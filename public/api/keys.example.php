<?php
/**
 * Ryyco - Configuración de Claves de API para Hostinger
 * 
 * INSTRUCCIONES PARA HOSTINGER:
 * 1. Renombra o copia este archivo como "keys.php" (dentro de la carpeta api/ en public_html).
 * 2. Asigna tus claves correspondientes:
 *    - RYYCO_HOSTINGER_GOOGLE_MAPS_KEY: Clave de Google Maps Platform (Maps JavaScript API y Geocoding API).
 *    - RYYCO_HOSTINGER_OPENAI_KEY: Clave de OpenAI (opcional para el asistente de voz).
 * 3. Guarda los cambios. ¡Listo! Google Maps y los servicios funcionarán de inmediato en tu dominio de Hostinger.
 */

// 1. Clave de Google Maps Platform para el selector de mapa interactivo y geocodificación de direcciones
if (!defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY')) {
    define('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY', '');
}

// 2. Clave de OpenAI para el Asistente de Voz / Realtime
if (!defined('RYYCO_HOSTINGER_OPENAI_KEY')) {
    define('RYYCO_HOSTINGER_OPENAI_KEY', '');
}


<?php
/**
 * Ryyco - Plantilla de Claves de API para Hostinger
 * Copia este archivo como 'apis' o 'apis.php' en tu servidor de Hostinger y pega tus claves reales.
 */

// 1. Clave de OpenAI para el Asistente de Voz / Realtime iAmesero
// Obtén tu clave en: https://platform.openai.com/api-keys
if (!defined('RYYCO_HOSTINGER_OPENAI_KEY')) {
    define('RYYCO_HOSTINGER_OPENAI_KEY', 'sk-proj-tu-clave-aqui'); // 👈 Pega aquí tu clave sk-proj-...
}

// 2. Clave de Google Maps Platform para el selector de mapa interactivo
if (!defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY')) {
    define('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY', 'AIzaSy-tu-clave-de-google-maps');
}

// 3. Clave del Servidor FCM (Firebase Cloud Messaging) para notificaciones
if (!defined('RYYCO_HOSTINGER_FCM_SERVER_KEY')) {
    define('RYYCO_HOSTINGER_FCM_SERVER_KEY', 'tu-clave-fcm-servidor');
}

// Mapeo automático de constantes a variables de entorno
if (defined('RYYCO_HOSTINGER_OPENAI_KEY') && !empty(constant('RYYCO_HOSTINGER_OPENAI_KEY'))) {
    $openaiKeyVal = trim(constant('RYYCO_HOSTINGER_OPENAI_KEY'));
    putenv("OPENAI_API_KEY=$openaiKeyVal");
    $_ENV['OPENAI_API_KEY'] = $openaiKeyVal;
    $_SERVER['OPENAI_API_KEY'] = $openaiKeyVal;
}

if (defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY') && !empty(constant('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY'))) {
    $mapsKeyVal = trim(constant('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY'));
    putenv("GOOGLE_MAPS_API_KEY=$mapsKeyVal");
    putenv("VITE_GOOGLE_MAPS_API_KEY=$mapsKeyVal");
    $_ENV['GOOGLE_MAPS_API_KEY'] = $mapsKeyVal;
    $_ENV['VITE_GOOGLE_MAPS_API_KEY'] = $mapsKeyVal;
    $_SERVER['GOOGLE_MAPS_API_KEY'] = $mapsKeyVal;
    $_SERVER['VITE_GOOGLE_MAPS_API_KEY'] = $mapsKeyVal;
}

if (defined('RYYCO_HOSTINGER_FCM_SERVER_KEY') && !empty(constant('RYYCO_HOSTINGER_FCM_SERVER_KEY'))) {
    $fcmKeyVal = trim(constant('RYYCO_HOSTINGER_FCM_SERVER_KEY'));
    putenv("FCM_SERVER_KEY=$fcmKeyVal");
    $_ENV['FCM_SERVER_KEY'] = $fcmKeyVal;
    $_SERVER['FCM_SERVER_KEY'] = $fcmKeyVal;
}

<?php
/**
 * Ryyco - Configuración de Claves de API para Hostinger
 * 
 * INSTRUCCIONES PARA HOSTINGER:
 * 1. Renombra o copia este archivo como "keys.php" (dentro de la carpeta api/).
 * 2. Reemplaza el texto 'PEGA_AQUI_TU_OPENAI_API_KEY' con tu clave real de OpenAI (ej: sk-proj-...).
 * 3. Guarda los cambios. ¡Listo! El asistente de voz funcionará de inmediato en ryyco.com.
 */

// Si no deseas usar .env o SetEnv en .htaccess, define tu clave aquí directamente:
if (!defined('RYYCO_HOSTINGER_OPENAI_KEY')) {
    define('RYYCO_HOSTINGER_OPENAI_KEY', '');
}

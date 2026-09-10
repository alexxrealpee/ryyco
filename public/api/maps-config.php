<?php
/**
 * Ryyco Google Maps Platform Configuration Endpoint for Hostinger / Apache
 *
 * Provides client-side configuration for Google Maps Platform:
 * - Returns the authorized API key (if configured in Hostinger environment, keys.php, or .env)
 * - Indicates whether Google Maps Platform is active or if Leaflet (OpenStreetMap) should be used
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300'); // Cache for 5 minutes

$key = defined('RYYCO_GOOGLE_MAPS_API_KEY') ? trim(RYYCO_GOOGLE_MAPS_API_KEY) : '';

echo json_encode([
    'status' => 'ok',
    'configured' => !empty($key),
    'apiKey' => $key,
    'provider' => !empty($key) ? 'google' : 'leaflet',
    'source' => 'hostinger_php_api',
    'timestamp' => time()
]);

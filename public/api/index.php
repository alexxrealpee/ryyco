<?php
/**
 * Ryyco Master API Router for Hostinger Apache Environments
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (strpos($uri, 'realtime') !== false || strpos($uri, 'client_secrets') !== false) {
    require __DIR__ . '/realtime-session.php';
    exit;
}

if (strpos($uri, 'voice-assistant') !== false) {
    require __DIR__ . '/voice-assistant.php';
    exit;
}

if (strpos($uri, 'tts') !== false) {
    require __DIR__ . '/tts.php';
    exit;
}

if (strpos($uri, 'maps/config') !== false || strpos($uri, 'maps-config') !== false || strpos($uri, 'maps/key') !== false) {
    require __DIR__ . '/maps-config.php';
    exit;
}

if (strpos($uri, 'maps/geocode') !== false || strpos($uri, 'maps-geocode') !== false || strpos($uri, 'geocode') !== false) {
    require __DIR__ . '/maps-geocode.php';
    exit;
}

if (strpos($uri, 'health') !== false) {
    require __DIR__ . '/health.php';
    exit;
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'status' => 'ok',
    'message' => 'Ryyco Hostinger API Bridge Active',
    'uri' => $uri
]);

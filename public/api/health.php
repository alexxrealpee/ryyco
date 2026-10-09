<?php
/**
 * Ryyco API Health Check
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');

$openAiKey = defined('RYYCO_OPENAI_API_KEY') ? trim(RYYCO_OPENAI_API_KEY) : '';
$mapsKey = defined('RYYCO_GOOGLE_MAPS_API_KEY') ? trim(RYYCO_GOOGLE_MAPS_API_KEY) : '';
$fcmKey = defined('RYYCO_FCM_SERVER_KEY') ? trim(RYYCO_FCM_SERVER_KEY) : '';

echo json_encode([
    'status' => 'ok',
    'environment' => 'hostinger-php',
    'timestamp' => time(),
    'hasOpenAI' => !empty($openAiKey),
    'openAiKeyPrefix' => !empty($openAiKey) ? substr($openAiKey, 0, 7) . '...' : null,
    'hasGoogleMaps' => !empty($mapsKey),
    'hasFCM' => !empty($fcmKey)
]);

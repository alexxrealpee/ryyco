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

$diag = [
    'docRoot' => isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : null,
    'openBasedir' => ini_get('open_basedir') ?: null,
    'serverKeys' => array_keys($_SERVER),
    'envKeys' => array_keys($_ENV),
    'getenv_openai' => !empty(getenv('OPENAI_API_KEY')),
    'apache_getenv_openai' => function_exists('apache_getenv') ? !empty(apache_getenv('OPENAI_API_KEY')) : 'not_available',
    'checkedPaths' => isset($GLOBALS['ryyco_checked_env_paths']) ? $GLOBALS['ryyco_checked_env_paths'] : []
];

echo json_encode([
    'status' => 'ok',
    'environment' => 'hostinger-php',
    'timestamp' => time(),
    'hasOpenAI' => !empty($openAiKey),
    'openAiKeyPrefix' => !empty($openAiKey) ? substr($openAiKey, 0, 7) . '...' : null,
    'hasGoogleMaps' => !empty($mapsKey),
    'hasFCM' => !empty($fcmKey),
    'diag' => $diag
], JSON_PRETTY_PRINT);

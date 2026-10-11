<?php
/**
 * RYYCO Health Check & Diagnostics for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$openaiKey = getApiKey('OPENAI_API_KEY');
$geminiKey = getApiKey('GEMINI_API_KEY');
$mapsKey = getApiKey('VITE_GOOGLE_MAPS_API_KEY') ?: getApiKey('GOOGLE_MAPS_API_KEY');
$fcmKey = getApiKey('FCM_SERVER_KEY');

$hasOpenAI = !empty($openaiKey);
$hasGemini = !empty($geminiKey);
$hasMaps = !empty($mapsKey);
$hasFcm = !empty($fcmKey);
$isApisLoaded = defined('RYYCO_HOSTINGER_OPENAI_KEY');

$testOpenAIResult = null;
if ((isset($_GET['test']) || isset($_GET['ping'])) && $hasOpenAI) {
    $testRes = curlJsonPost('https://api.openai.com/v1/chat/completions', [
        'model' => 'gpt-4o-mini',
        'messages' => [['role' => 'user', 'content' => 'Di hola']],
        'max_tokens' => 5
    ], ["Authorization: Bearer {$openaiKey}"], 15);
    $testOpenAIResult = [
        'http_status' => $testRes['status'],
        'connected' => ($testRes['status'] === 200),
        'response_preview' => ($testRes['status'] === 200) ? 'Conexión exitosa con OpenAI GPT' : null,
        'details' => ($testRes['status'] !== 200) ? ($testRes['body'] ?: $testRes['error']) : null
    ];
}

echo json_encode([
    'status' => 'ok',
    'platform' => 'Hostinger Web Hosting (PHP)',
    'php_version' => PHP_VERSION,
    'apis_file_active' => $isApisLoaded,
    'apis' => [
        'openai_gpt' => [
            'configured' => $hasOpenAI,
            'source' => $isApisLoaded ? 'apis' : (!empty(getenv('OPENAI_API_KEY')) ? 'env' : 'none'),
            'key_hint' => $hasOpenAI ? substr($openaiKey, 0, 7) . '...' . substr($openaiKey, -4) : 'NO_CONFIGURADA',
            'live_test' => $testOpenAIResult
        ],
        'google_maps' => [
            'configured' => $hasMaps,
            'source' => defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY') ? 'apis' : 'env'
        ],
        'fcm_notifications' => [
            'configured' => $hasFcm,
            'source' => defined('RYYCO_HOSTINGER_FCM_SERVER_KEY') ? 'apis' : 'env'
        ]
    ],
    'instructions' => $hasOpenAI 
        ? '✓ OpenAI GPT está activo y listo para responder consultas de voz y texto.' 
        : 'Para activar GPT en Hostinger, sube el archivo apis o apis.php con tu clave de OpenAI a public_html/ o public_html/api/.',
    'timestamp' => date('c')
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

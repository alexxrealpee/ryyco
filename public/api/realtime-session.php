<?php
/**
 * Ryyco OpenAI Realtime Ephemeral Token Handler for Hostinger
 * Provisions WebRTC client credentials directly on ryyco.com
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');

$apiKey = RYYCO_OPENAI_API_KEY;

if (!$apiKey) {
    http_response_code(500);
    echo json_encode([
        'error' => 'OpenAI API Key no está configurada en el servidor de Hostinger.'
    ]);
    exit;
}

// 1. Try OpenAI client_secrets endpoint first
$ch = curl_init('https://api.openai.com/v1/realtime/client_secrets');
$payload = json_encode([
    'session' => [
        'type' => 'realtime',
        'model' => 'gpt-4o-realtime-preview'
    ]
]);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

// 2. If client_secrets endpoint succeeded, return it directly
if ($httpCode >= 200 && $httpCode < 300 && $response) {
    echo $response;
    exit;
}

// 3. Fallback: Try standard realtime/sessions endpoint
$ch2 = curl_init('https://api.openai.com/v1/realtime/sessions');
curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch2, CURLOPT_POST, true);
curl_setopt($ch2, CURLOPT_POSTFIELDS, json_encode([
    'model' => 'gpt-4o-realtime-preview',
    'voice' => 'alloy'
]));
curl_setopt($ch2, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Content-Type: application/json'
]);
curl_setopt($ch2, CURLOPT_TIMEOUT, 15);

$response2 = curl_exec($ch2);
$httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
curl_close($ch2);

if ($httpCode2 >= 200 && $httpCode2 < 300 && $response2) {
    echo $response2;
    exit;
}

// If both endpoints failed, return JSON error with details
http_response_code($httpCode ?: 500);
echo json_encode([
    'error' => 'No se pudo generar el token efímero de OpenAI Realtime.',
    'details' => $response ?: $curlErr ?: 'Error de conexión con OpenAI'
]);

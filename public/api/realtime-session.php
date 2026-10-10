<?php
/**
 * RYYCO OpenAI Realtime Voice WebRTC Session Provisioning for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$openaiKey = getApiKey('OPENAI_API_KEY');

if (empty($openaiKey)) {
    http_response_code(500);
    echo json_encode([
        'error' => 'OPENAI_API_KEY no está configurada en el servidor de Hostinger. Agrega tu clave en el archivo .env o en el panel de control de Hostinger.'
    ], JSON_UNESCAPED_UNICODE);
    exit(0);
}

$instructions = <<<INST
Eres "IAMesero", la mesera y asistente virtual inteligente de Ryyco (ryyco.com).
Habla en español colombiano natural, cálido y espontáneo. Usa expresiones suaves y cotidianas de Colombia.
Respuestas breves y conversacionales: entre 1 y 3 frases fluidas.
Pronuncia siempre los precios en pesos colombianos de forma natural.
No leas emojis, símbolos de Markdown, JSON ni etiquetas técnicas.
INST;

$sessionPayload = [
    'model' => 'gpt-4o-realtime-preview',
    'voice' => 'shimmer',
    'modalities' => ['audio', 'text'],
    'instructions' => $instructions,
    'turn_detection' => [
        'type' => 'server_vad',
        'threshold' => 0.5,
        'prefix_padding_ms' => 300,
        'silence_duration_ms' => 500
    ],
    'temperature' => 0.7
];

$headers = [
    "Authorization: Bearer {$openaiKey}"
];

// Try client_secrets endpoint first (Standard for ephemeral WebRTC token)
$response = curlJsonPost('https://api.openai.com/v1/realtime/client_secrets', $sessionPayload, $headers, 20);

// If client_secrets is not 200, try /sessions endpoint
if ($response['status'] !== 200 || empty($response['body'])) {
    $response = curlJsonPost('https://api.openai.com/v1/realtime/sessions', $sessionPayload, $headers, 20);
}

if ($response['status'] >= 200 && $response['status'] < 300 && !empty($response['body'])) {
    echo $response['body'];
    exit(0);
}

http_response_code($response['status'] > 0 ? $response['status'] : 502);
echo json_encode([
    'error' => 'Error al comunicar con OpenAI Realtime API',
    'details' => $response['body'] ?: $response['error']
], JSON_UNESCAPED_UNICODE);

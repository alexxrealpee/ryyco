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
        'error' => 'OPENAI_API_KEY no está configurada en el servidor de Hostinger. Agrega tu clave en keys.php o en el panel de control de Hostinger.'
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

$candidateModels = [
    'gpt-realtime-mini',
    'gpt-4o-mini-realtime-preview-2024-12-17',
    'gpt-4o-mini-realtime-preview',
    'gpt-4o-realtime-preview-2024-12-17',
    'gpt-4o-realtime-preview',
    'gpt-realtime'
];

$headers = [
    "Authorization: Bearer {$openaiKey}"
];

$lastResponseBody = null;
$lastStatus = 500;

// 1. Try standard OpenAI client_secrets endpoint with wrapped session structure
foreach ($candidateModels as $model) {
    $csPayload = [
        'session' => [
            'type' => 'realtime',
            'model' => $model
        ]
    ];
    $response = curlJsonPost('https://api.openai.com/v1/realtime/client_secrets', $csPayload, $headers, 15);
    $lastStatus = $response['status'];
    $lastResponseBody = $response['body'] ?: $response['error'];

    if ($response['status'] >= 200 && $response['status'] < 300 && !empty($response['body'])) {
        $data = json_decode($response['body'], true);
        if ($data && (!empty($data['value']) || !empty($data['client_secret']))) {
            echo $response['body'];
            exit(0);
        }
    }
}

// 2. Try standard /sessions endpoint if client_secrets is not available or rejected
foreach ($candidateModels as $model) {
    $sessionPayload = [
        'model' => $model,
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
    $response = curlJsonPost('https://api.openai.com/v1/realtime/sessions', $sessionPayload, $headers, 15);
    $lastStatus = $response['status'];
    $lastResponseBody = $response['body'] ?: $response['error'];

    if ($response['status'] >= 200 && $response['status'] < 300 && !empty($response['body'])) {
        $data = json_decode($response['body'], true);
        if ($data && (!empty($data['client_secret']) || !empty($data['value']))) {
            echo $response['body'];
            exit(0);
        }
    }
}

// If OpenAI returns error (e.g. Realtime API requires Tier 1+ or quota issue)
http_response_code($lastStatus > 0 ? $lastStatus : 502);
echo json_encode([
    'error' => 'Error al comunicar con OpenAI Realtime API',
    'details' => $lastResponseBody
], JSON_UNESCAPED_UNICODE);

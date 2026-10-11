<?php
/**
 * RYYCO Text-To-Speech (OpenAI TTS) Endpoint for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Método no permitido. Utiliza POST.']);
    exit(0);
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

$text = trim($data['text'] ?? '');
$voice = trim($data['voice'] ?? 'shimmer');
$speed = floatval($data['speed'] ?? 1.0);

if (empty($text)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'El texto para sintetizar es obligatorio.']);
    exit(0);
}

$openaiKey = getApiKey('OPENAI_API_KEY');

if (empty($openaiKey)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'OPENAI_API_KEY no configurada en Hostinger.']);
    exit(0);
}

$ttsPayload = [
    'model' => 'tts-1',
    'input' => $text,
    'voice' => $voice,
    'speed' => $speed,
    'response_format' => 'mp3'
];

$ch = curl_init('https://api.openai.com/v1/audio/speech');
$json = json_encode($ttsPayload);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $json,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        "Authorization: Bearer {$openaiKey}"
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0
]);

$audioData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && !empty($audioData)) {
    header('Content-Type: audio/mpeg');
    header('Content-Length: ' . strlen($audioData));
    header('Cache-Control: public, max-age=86400');
    echo $audioData;
    exit(0);
}

http_response_code($httpCode > 0 ? $httpCode : 502);
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'error' => 'Error al sintetizar voz con OpenAI TTS',
    'status' => $httpCode
]);

<?php
/**
 * Ryyco High Definition Text-to-Speech (TTS) Endpoint for Hostinger
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');

$inputRaw = file_get_contents('php://input');
$data = json_decode($inputRaw, true);

if (!$data || empty($data['text'])) {
    http_response_code(400);
    echo json_encode(['error' => 'El texto es obligatorio.']);
    exit;
}

$text = trim($data['text']);
$cleanText = preg_replace('/\$\s*([0-9]+(?:[.,][0-9]+)*)/', '$1 pesos', $text);
$cleanText = preg_replace('/[*_#`~]/', '', $cleanText);
$cleanText = mb_substr($cleanText, 0, 400);

$apiKey = RYYCO_OPENAI_API_KEY;

if (!$apiKey) {
    http_response_code(200);
    echo json_encode(['error' => 'TTS no configurado']);
    exit;
}

$ch = curl_init('https://api.openai.com/v1/audio/speech');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model' => 'tts-1',
    'input' => $cleanText,
    'voice' => 'alloy',
    'response_format' => 'mp3'
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 12);

$audioBinary = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode >= 200 && $httpCode < 300 && $audioBinary) {
    echo json_encode([
        'audio' => base64_encode($audioBinary),
        'mimeType' => 'audio/mpeg'
    ]);
    exit;
}

http_response_code(200);
echo json_encode(['error' => 'No se pudo generar el audio TTS']);

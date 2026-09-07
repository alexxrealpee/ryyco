<?php
/**
 * Ryyco Voice Assistant Endpoint for Hostinger (OpenAI GPT-4o backend)
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');

$inputRaw = file_get_contents('php://input');
$data = json_decode($inputRaw, true);

if (!$data || empty($data['message'])) {
    http_response_code(400);
    echo json_encode(['error' => 'El mensaje es obligatorio.']);
    exit;
}

$userMessage = trim($data['message']);
$history = isset($data['history']) && is_array($data['history']) ? $data['history'] : [];
$catalogContext = isset($data['catalogContext']) ? $data['catalogContext'] : [];
$products = isset($catalogContext['products']) ? $catalogContext['products'] : [];
$stores = isset($catalogContext['stores']) ? $catalogContext['stores'] : [];
$deliveryFee = isset($catalogContext['deliveryFee']) ? intval($catalogContext['deliveryFee']) : 4000;
$cart = isset($catalogContext['cart']) ? $catalogContext['cart'] : [];

$apiKey = RYYCO_OPENAI_API_KEY;

if (!$apiKey) {
    echo json_encode([
        'text' => '¡Hola! Qué gusto saludarte en Ryyco. ¿Qué te gustaría ordenar hoy?',
        'speechText' => '¡Hola! Qué gusto saludarte en Ryyco. ¿Qué te gustaría ordenar hoy?',
        'actions' => []
    ]);
    exit;
}

// Build compact context of open stores and products
$storesSummary = [];
foreach (array_slice($stores, 0, 15) as $s) {
    $name = isset($s['displayName']) ? $s['displayName'] : (isset($s['username']) ? $s['username'] : 'Restaurante');
    $user = isset($s['username']) ? $s['username'] : '';
    $storesSummary[] = "- $name (@$user)";
}

$productsSummary = [];
foreach (array_slice($products, 0, 25) as $p) {
    $pName = isset($p['name']) ? $p['name'] : 'Producto';
    $pPrice = isset($p['price']) ? number_format(intval($p['price']), 0, '', '.') : '0';
    $pStore = isset($p['storeName']) ? $p['storeName'] : 'Tienda';
    $pId = isset($p['id']) ? $p['id'] : '';
    $productsSummary[] = "- $pName ($pStore): $pPrice pesos [ID: $pId]";
}

$systemPrompt = "Eres 'IAMesero', la mesera y asistente virtual inteligente de Ryyco (ryyco.com) en Colombia.
Habla en español colombiano natural, cálido y conciso (máximo 1 a 3 frases).
REGLAS:
1. Solo recomienda o vende productos y tiendas disponibles en la lista de tiendas y productos abiertos.
2. Si el usuario quiere pedir algo, genera un objeto de acción en 'actions' tipo 'ADD_TO_CART' con productId, quantity, etc.
3. Pronuncia precios en pesos colombianos (ej: 'veinticinco mil pesos').
4. Devuelve SIEMPRE un JSON válido con esta estructura:
{
  \"text\": \"Respuesta escrita para el cliente\",
  \"speechText\": \"Texto limpio para reproducir por voz\",
  \"actions\": []
}

TIENDAS DISPONIBLES:
" . implode("\n", $storesSummary) . "

PRODUCTOS DISPONIBLES:
" . implode("\n", $productsSummary);

$messages = [
    ['role' => 'system', 'content' => $systemPrompt]
];

foreach (array_slice($history, -6) as $h) {
    $role = (isset($h['role']) && $h['role'] === 'user') ? 'user' : 'assistant';
    $text = '';
    if (isset($h['parts'][0]['text'])) {
        $text = $h['parts'][0]['text'];
    } elseif (isset($h['text'])) {
        $text = $h['text'];
    }
    if (!empty($text)) {
        $messages[] = ['role' => $role, 'content' => $text];
    }
}

$messages[] = ['role' => 'user', 'content' => $userMessage];

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model' => 'gpt-4o-mini',
    'messages' => $messages,
    'response_format' => ['type' => 'json_object'],
    'temperature' => 0.5,
    'max_tokens' => 350
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode >= 200 && $httpCode < 300 && $response) {
    $resData = json_decode($response, true);
    $content = $resData['choices'][0]['message']['content'] ?? '';
    if ($content) {
        $parsed = json_decode($content, true);
        if ($parsed && isset($parsed['text'])) {
            echo json_encode($parsed);
            exit;
        }
    }
}

// Fallback response if OpenAI call failed
echo json_encode([
    'text' => '¡Con gusto te atiendo! Tenemos excelentes platos disponibles en nuestros restaurantes afiliados. ¿Qué se te antoja probar hoy?',
    'speechText' => '¡Con gusto te atiendo! Tenemos excelentes platos disponibles en nuestros restaurantes afiliados. ¿Qué se te antoja probar hoy?',
    'actions' => []
]);

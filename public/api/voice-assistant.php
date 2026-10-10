<?php
/**
 * RYYCO LinnkPro AI Voice & Text Assistant (OpenAI GPT-4o / GPT-4o-mini / Gemini fallback)
 * Runs natively on Hostinger PHP without requiring external Node.js server.
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido. Utiliza POST.']);
    exit(0);
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!$data || empty($data['message']) || !is_string($data['message'])) {
    http_response_code(400);
    echo json_encode(['error' => 'El mensaje de voz o texto es obligatorio.']);
    exit(0);
}

$userMessage = trim($data['message']);
$history = is_array($data['history'] ?? null) ? $data['history'] : [];
$catalogContext = is_array($data['catalogContext'] ?? null) ? $data['catalogContext'] : [
    'products' => [],
    'stores' => [],
    'deliveryFee' => 7000,
    'cart' => []
];

$openaiKey = getApiKey('OPENAI_API_KEY');
$geminiKey = getApiKey('GEMINI_API_KEY');

// Prepare catalog summary for system prompt
$products = is_array($catalogContext['products'] ?? null) ? $catalogContext['products'] : [];
$stores = is_array($catalogContext['stores'] ?? null) ? $catalogContext['stores'] : [];

$storesSummary = [];
foreach (array_slice($stores, 0, 20) as $s) {
    if (is_array($s) && empty($s['isClosed']) && !empty($s['displayName'])) {
        $name = $s['displayName'];
        $user = $s['username'] ?? '';
        $storesSummary[] = "- {$name} (@{$user})";
    }
}
$storesText = !empty($storesSummary) ? implode("\n", $storesSummary) : "No hay tiendas abiertas registradas.";

$productsSummary = [];
foreach (array_slice($products, 0, 40) as $p) {
    if (is_array($p) && !empty($p['name'])) {
        $pId = $p['id'] ?? '';
        $pName = $p['name'];
        $pPrice = number_format((float)($p['price'] ?? 0), 0, ',', '.');
        $pStore = $p['storeName'] ?? 'Restaurante';
        $pCat = $p['category'] ?? 'General';
        $productsSummary[] = "- [ID: {$pId}] {$pName}: \${$pPrice} COP ({$pStore}) [{$pCat}]";
    }
}
$productsText = !empty($productsSummary) ? implode("\n", $productsSummary) : "Catálogo disponible en la plataforma.";

$systemPrompt = <<<PROMPT
Eres "IAMesero", la mesera y asistente virtual inteligente de Ryyco (ryyco.com).
Hablas en español colombiano natural, amable, cálido y espontáneo ("¡Hola! Qué gusto saludarte", "¡Con mucho gusto!", "¡Claro que sí!").
Respuestas breves y conversacionales: entre 1 y 3 frases fluidas.
Pronuncia siempre los precios en pesos colombianos de forma natural (ejemplo: "veinticinco mil pesos", "doce mil quinientos pesos", sin signos raros).
No leas emojis, asteriscos ni etiquetas técnicas en voz alta.

CATÁLOGO REAL DISPONIBLE:
TIENDAS ABIERTAS:
{$storesText}

PRODUCTOS DISPONIBLES:
{$productsText}

DIRECTIVA OBLIGATORIA:
Si el cliente pide agregar un producto o comprar algo, genera una acción "add_to_cart" con el productId, name, price y storeName exactos del catálogo.
Responde SIEMPRE en formato JSON válido con la siguiente estructura:
{
  "text": "tu respuesta hablada para el cliente aquí",
  "reply": "tu respuesta hablada para el cliente aquí",
  "actions": [
    {
      "type": "add_to_cart",
      "payload": {
        "productId": "id_del_producto",
        "name": "nombre_del_producto",
        "price": 20000,
        "quantity": 1,
        "storeName": "nombre_tienda"
      }
    }
  ]
}
Si el cliente solo saluda o pregunta información sin pedir agregar al carrito, deja "actions": [].
PROMPT;

// 1. Try OpenAI GPT-4o-mini
if (!empty($openaiKey)) {
    $messages = [
        ['role' => 'system', 'content' => $systemPrompt]
    ];

    foreach (array_slice($history, -6) as $h) {
        if (is_array($h) && !empty($h['text'])) {
            $role = ($h['role'] ?? 'user') === 'assistant' ? 'assistant' : 'user';
            $messages[] = ['role' => $role, 'content' => (string)$h['text']];
        }
    }

    $messages[] = ['role' => 'user', 'content' => $userMessage];

    $gptPayload = [
        'model' => 'gpt-4o-mini',
        'messages' => $messages,
        'temperature' => 0.7,
        'response_format' => ['type' => 'json_object']
    ];

    $headers = [
        "Authorization: Bearer {$openaiKey}"
    ];

    $response = curlJsonPost('https://api.openai.com/v1/chat/completions', $gptPayload, $headers, 25);

    if ($response['status'] === 200 && !empty($response['body'])) {
        $resJson = json_decode($response['body'], true);
        $content = $resJson['choices'][0]['message']['content'] ?? '';
        if (!empty($content)) {
            $parsed = json_decode($content, true);
            if (is_array($parsed) && (!empty($parsed['text']) || !empty($parsed['reply']))) {
                if (empty($parsed['text']) && !empty($parsed['reply'])) $parsed['text'] = $parsed['reply'];
                if (empty($parsed['reply']) && !empty($parsed['text'])) $parsed['reply'] = $parsed['text'];
                if (!isset($parsed['actions'])) $parsed['actions'] = [];
                echo json_encode($parsed, JSON_UNESCAPED_UNICODE);
                exit(0);
            }
        }
    }
}

// 2. Try Gemini fallback if OpenAI is not set or failed
if (!empty($geminiKey)) {
    $geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . urlencode($geminiKey);
    $geminiPayload = [
        'contents' => [
            [
                'role' => 'user',
                'parts' => [
                    ['text' => $systemPrompt . "\n\nMensaje del cliente: " . $userMessage . "\nResponde estrictamente en formato JSON."]
                ]
            ]
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json'
        ]
    ];

    $gResponse = curlJsonPost($geminiUrl, $geminiPayload, [], 20);
    if ($gResponse['status'] === 200 && !empty($gResponse['body'])) {
        $gJson = json_decode($gResponse['body'], true);
        $candidateText = $gJson['candidates'][0]['content']['parts'][0]['text'] ?? '';
        if (!empty($candidateText)) {
            $parsed = json_decode($candidateText, true);
            if (is_array($parsed) && (!empty($parsed['text']) || !empty($parsed['reply']))) {
                if (empty($parsed['text']) && !empty($parsed['reply'])) $parsed['text'] = $parsed['reply'];
                if (empty($parsed['reply']) && !empty($parsed['text'])) $parsed['reply'] = $parsed['text'];
                if (!isset($parsed['actions'])) $parsed['actions'] = [];
                echo json_encode($parsed, JSON_UNESCAPED_UNICODE);
                exit(0);
            }
        }
    }
}

// 3. Resilient natural language catalog search fallback
$lowerMsg = mb_strtolower($userMessage, 'UTF-8');
$matchedProduct = null;
foreach ($products as $p) {
    if (is_array($p) && !empty($p['name'])) {
        $pNameLower = mb_strtolower($p['name'], 'UTF-8');
        if (strpos($lowerMsg, $pNameLower) !== false || strpos($pNameLower, $lowerMsg) !== false) {
            $matchedProduct = $p;
            break;
        }
    }
}

$actions = [];
if ($matchedProduct) {
    $pName = $matchedProduct['name'];
    $pPrice = (int)($matchedProduct['price'] ?? 0);
    $pStore = $matchedProduct['storeName'] ?? 'Restaurante';
    $replyText = "¡Excelente elección! Tenemos {$pName} de {$pStore} por " . number_format($pPrice, 0, ',', '.') . " pesos. ¿Deseas que lo agregue a tu pedido?";
    if (strpos($lowerMsg, 'agrega') !== false || strpos($lowerMsg, 'quiero') !== false || strpos($lowerMsg, 'pide') !== false || strpos($lowerMsg, 'dame') !== false) {
        $actions[] = [
            'type' => 'add_to_cart',
            'payload' => [
                'productId' => $matchedProduct['id'] ?? '',
                'name' => $pName,
                'price' => $pPrice,
                'quantity' => 1,
                'storeName' => $pStore
            ]
        ];
        $replyText = "¡Listo! He agregado {$pName} a tu carrito. ¿Te gustaría ordenar algo más?";
    }
} else {
    $replyText = "¡Hola! Con mucho gusto te ayudo a pedir tu comida favorita en Ryyco. Puedes pedirme hamburguesas, pizzas, platos típicos o bebidas de nuestros restaurantes abiertos.";
}

echo json_encode([
    'text' => $replyText,
    'reply' => $replyText,
    'actions' => $actions,
    'note' => empty($openaiKey) ? 'Configura OPENAI_API_KEY en tu hosting para activar GPT con inteligencia artificial completa.' : null
], JSON_UNESCAPED_UNICODE);

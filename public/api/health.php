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

$hasOpenAI = !empty($openaiKey);
$hasGemini = !empty($geminiKey);
$hasMaps = !empty($mapsKey);

echo json_encode([
    'status' => 'ok',
    'platform' => 'Hostinger Web Hosting (PHP)',
    'php_version' => PHP_VERSION,
    'apis' => [
        'openai_gpt' => [
            'configured' => $hasOpenAI,
            'key_hint' => $hasOpenAI ? substr($openaiKey, 0, 7) . '...' . substr($openaiKey, -4) : 'NO_CONFIGURADA'
        ],
        'gemini' => [
            'configured' => $hasGemini,
            'key_hint' => $hasGemini ? substr($geminiKey, 0, 7) . '...' . substr($geminiKey, -4) : 'NO_CONFIGURADA'
        ],
        'google_maps' => [
            'configured' => $hasMaps
        ]
    ],
    'instructions' => $hasOpenAI 
        ? 'OpenAI GPT está activo y listo para responder consultas de voz y texto.' 
        : 'Para activar GPT en Hostinger, crea un archivo .env en la raíz de tu hosting con: OPENAI_API_KEY=tu_clave_aqui, o en el archivo .htaccess con SetEnv OPENAI_API_KEY "tu_clave"',
    'timestamp' => date('c')
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

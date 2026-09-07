<?php
/**
 * Ryyco API Health Check
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'status' => 'ok',
    'environment' => 'hostinger-php',
    'timestamp' => time(),
    'hasOpenAI' => !empty(RYYCO_OPENAI_API_KEY)
]);

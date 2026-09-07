<?php
/**
 * Ryyco API Configuration for Hostinger / Apache Environments
 */

// Report errors cleanly in JSON format
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);

// Load API Keys from environment or local .env if available
$envOpenAIKey = getenv('OPENAI_API_KEY');
if (!$envOpenAIKey && isset($_SERVER['OPENAI_API_KEY'])) {
    $envOpenAIKey = $_SERVER['OPENAI_API_KEY'];
}
if (!$envOpenAIKey && isset($_ENV['OPENAI_API_KEY'])) {
    $envOpenAIKey = $_ENV['OPENAI_API_KEY'];
}

// Optionally load from a local uncommitted .env file on Hostinger
if (!$envOpenAIKey) {
    $envFilePath = __DIR__ . '/../../.env';
    if (file_exists($envFilePath)) {
        $lines = @file($envFilePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            foreach ($lines as $line) {
                if (strpos(trim($line), 'OPENAI_API_KEY=') === 0) {
                    $envOpenAIKey = trim(substr(trim($line), strlen('OPENAI_API_KEY=')));
                    $envOpenAIKey = trim($envOpenAIKey, '"\'');
                    break;
                }
            }
        }
    }
}

define('RYYCO_OPENAI_API_KEY', $envOpenAIKey ?: '');

// CORS helper
function ryyco_apply_cors() {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD");
    header("Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization, Range");
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Max-Age: 86400");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

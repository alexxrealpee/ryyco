<?php
/**
 * Ryyco API Configuration for Hostinger / Apache Environments
 */

// Report errors cleanly in JSON format
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);

// 1. Direct configuration file for Hostinger users (keys.php or keys.local.php)
$keyFiles = [
    __DIR__ . '/keys.php',
    __DIR__ . '/keys.local.php',
    __DIR__ . '/../keys.php'
];
foreach ($keyFiles as $kf) {
    if (file_exists($kf) && is_readable($kf)) {
        @include_once $kf;
        if (defined('RYYCO_HOSTINGER_OPENAI_KEY') && !empty(RYYCO_HOSTINGER_OPENAI_KEY)) {
            $envOpenAIKey = trim(RYYCO_HOSTINGER_OPENAI_KEY);
            break;
        }
    }
}

// 2. Load API Keys strictly from server-side environment or local .env
if (!$envOpenAIKey) {
    $envOpenAIKey = getenv('OPENAI_API_KEY');
}
if (!$envOpenAIKey && isset($_SERVER['OPENAI_API_KEY'])) {
    $envOpenAIKey = $_SERVER['OPENAI_API_KEY'];
}
if (!$envOpenAIKey && isset($_SERVER['REDIRECT_OPENAI_API_KEY'])) {
    $envOpenAIKey = $_SERVER['REDIRECT_OPENAI_API_KEY'];
}
if (!$envOpenAIKey && isset($_ENV['OPENAI_API_KEY'])) {
    $envOpenAIKey = $_ENV['OPENAI_API_KEY'];
}
if (!$envOpenAIKey && function_exists('apache_getenv')) {
    $envOpenAIKey = apache_getenv('OPENAI_API_KEY');
}

// Optionally load from a local uncommitted .env file on Hostinger
if (!$envOpenAIKey) {
    $potentialPaths = array_filter([
        __DIR__ . '/../../.env',
        __DIR__ . '/../.env',
        __DIR__ . '/.env',
        (isset($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/\\') . '/.env' : null),
        (isset($_SERVER['DOCUMENT_ROOT']) ? dirname(rtrim($_SERVER['DOCUMENT_ROOT'], '/\\')) . '/.env' : null),
        getcwd() . '/.env'
    ]);

    foreach ($potentialPaths as $envFilePath) {
        if ($envFilePath && file_exists($envFilePath) && is_readable($envFilePath)) {
            $lines = @file($envFilePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines) {
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (strpos($trimmed, '#') === 0) continue;
                    if (strpos($trimmed, 'OPENAI_API_KEY=') === 0) {
                        $val = trim(substr($trimmed, strlen('OPENAI_API_KEY=')));
                        $val = trim($val, '"\'');
                        if (!empty($val)) {
                            $envOpenAIKey = $val;
                            break 2;
                        }
                    }
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

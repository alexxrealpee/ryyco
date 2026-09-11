<?php
/**
 * Ryyco API Configuration for Hostinger / Apache Environments
 */

// Start output buffering immediately so any stray whitespace, BOM or syntax mistakes
// from included files (e.g. k?php) do not prematurely output before JSON headers
if (!ob_get_level()) {
    ob_start();
}

// Report errors cleanly in JSON format
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);

// 1. Direct configuration file for Hostinger users (keys.php or keys.local.php)
$envOpenAIKey = '';
$envGoogleMapsKey = '';

$keyFiles = [
    __DIR__ . '/keys.php',
    __DIR__ . '/keys.local.php',
    __DIR__ . '/../keys.php'
];
foreach ($keyFiles as $kf) {
    if (file_exists($kf) && is_readable($kf)) {
        @include_once $kf;
        if (defined('RYYCO_HOSTINGER_OPENAI_KEY') && !empty(RYYCO_HOSTINGER_OPENAI_KEY) && empty($envOpenAIKey)) {
            $envOpenAIKey = trim(RYYCO_HOSTINGER_OPENAI_KEY);
        }
        if (defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY') && !empty(RYYCO_HOSTINGER_GOOGLE_MAPS_KEY) && empty($envGoogleMapsKey)) {
            $envGoogleMapsKey = trim(RYYCO_HOSTINGER_GOOGLE_MAPS_KEY);
        }

        // Resilient Fallback: If include failed due to a typo like "k?php" or BOM, parse keys directly
        if (empty($envGoogleMapsKey) || empty($envOpenAIKey)) {
            $fileRaw = @file_get_contents($kf);
            if (!empty($fileRaw)) {
                if (empty($envGoogleMapsKey)) {
                    // Match define('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY', '...')
                    if (preg_match("/RYYCO_HOSTINGER_GOOGLE_MAPS_KEY['\"]\s*,\s*['\"]([^'\"]+)['\"]/i", $fileRaw, $m)) {
                        $candidate = trim($m[1]);
                        if (!empty($candidate)) $envGoogleMapsKey = $candidate;
                    } elseif (preg_match("/['\"](AIzaSy[A-Za-z0-9_-]{33})['\"]/", $fileRaw, $m)) {
                        $envGoogleMapsKey = trim($m[1]);
                    }
                }
                if (empty($envOpenAIKey)) {
                    // Match define('RYYCO_HOSTINGER_OPENAI_KEY', '...')
                    if (preg_match("/RYYCO_HOSTINGER_OPENAI_KEY['\"]\s*,\s*['\"]([^'\"]+)['\"]/i", $fileRaw, $m)) {
                        $candidate = trim($m[1]);
                        if (!empty($candidate)) $envOpenAIKey = $candidate;
                    } elseif (preg_match("/['\"](sk-[A-Za-z0-9_-]{20,})['\"]/", $fileRaw, $m)) {
                        $envOpenAIKey = trim($m[1]);
                    }
                }
            }
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

// 2b. Load Google Maps API Key from environment
if (!$envGoogleMapsKey) {
    $envGoogleMapsKey = getenv('GOOGLE_MAPS_API_KEY') ?: getenv('VITE_GOOGLE_MAPS_API_KEY');
}
if (!$envGoogleMapsKey && isset($_SERVER['GOOGLE_MAPS_API_KEY'])) {
    $envGoogleMapsKey = $_SERVER['GOOGLE_MAPS_API_KEY'];
}
if (!$envGoogleMapsKey && isset($_SERVER['VITE_GOOGLE_MAPS_API_KEY'])) {
    $envGoogleMapsKey = $_SERVER['VITE_GOOGLE_MAPS_API_KEY'];
}
if (!$envGoogleMapsKey && isset($_SERVER['REDIRECT_GOOGLE_MAPS_API_KEY'])) {
    $envGoogleMapsKey = $_SERVER['REDIRECT_GOOGLE_MAPS_API_KEY'];
}
if (!$envGoogleMapsKey && isset($_SERVER['REDIRECT_VITE_GOOGLE_MAPS_API_KEY'])) {
    $envGoogleMapsKey = $_SERVER['REDIRECT_VITE_GOOGLE_MAPS_API_KEY'];
}
if (!$envGoogleMapsKey && isset($_ENV['GOOGLE_MAPS_API_KEY'])) {
    $envGoogleMapsKey = $_ENV['GOOGLE_MAPS_API_KEY'];
}
if (!$envGoogleMapsKey && isset($_ENV['VITE_GOOGLE_MAPS_API_KEY'])) {
    $envGoogleMapsKey = $_ENV['VITE_GOOGLE_MAPS_API_KEY'];
}
if (!$envGoogleMapsKey && function_exists('apache_getenv')) {
    $envGoogleMapsKey = apache_getenv('GOOGLE_MAPS_API_KEY') ?: apache_getenv('VITE_GOOGLE_MAPS_API_KEY');
}

// Optionally load from a local uncommitted .env file on Hostinger
if (!$envOpenAIKey || !$envGoogleMapsKey) {
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
                    if (!$envOpenAIKey && strpos($trimmed, 'OPENAI_API_KEY=') === 0) {
                        $val = trim(substr($trimmed, strlen('OPENAI_API_KEY=')));
                        $val = trim($val, '"\'');
                        if (!empty($val)) {
                            $envOpenAIKey = $val;
                        }
                    }
                    if (!$envGoogleMapsKey && (strpos($trimmed, 'GOOGLE_MAPS_API_KEY=') === 0 || strpos($trimmed, 'VITE_GOOGLE_MAPS_API_KEY=') === 0)) {
                        $prefix = strpos($trimmed, 'GOOGLE_MAPS_API_KEY=') === 0 ? 'GOOGLE_MAPS_API_KEY=' : 'VITE_GOOGLE_MAPS_API_KEY=';
                        $val = trim(substr($trimmed, strlen($prefix)));
                        $val = trim($val, '"\'');
                        if (!empty($val)) {
                            $envGoogleMapsKey = $val;
                        }
                    }
                }
            }
        }
    }
}

define('RYYCO_OPENAI_API_KEY', $envOpenAIKey ?: '');
define('RYYCO_GOOGLE_MAPS_API_KEY', $envGoogleMapsKey ?: '');

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

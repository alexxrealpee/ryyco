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

// 1. Load API Keys directly from Hostinger Environment Variables
$envOpenAIKey = '';
$envGoogleMapsKey = '';
$envFCMServerKey = '';

// Check Hostinger environment variables across all server scopes ($_SERVER, $_ENV, getenv, apache_getenv, REDIRECT_*)
$envOpenAIKey = getenv('OPENAI_API_KEY') 
    ?: (isset($_SERVER['OPENAI_API_KEY']) ? $_SERVER['OPENAI_API_KEY'] : '')
    ?: (isset($_SERVER['REDIRECT_OPENAI_API_KEY']) ? $_SERVER['REDIRECT_OPENAI_API_KEY'] : '')
    ?: (isset($_ENV['OPENAI_API_KEY']) ? $_ENV['OPENAI_API_KEY'] : '')
    ?: (function_exists('apache_getenv') ? apache_getenv('OPENAI_API_KEY') : '');

$envGoogleMapsKey = getenv('VITE_GOOGLE_MAPS_API_KEY') 
    ?: getenv('GOOGLE_MAPS_API_KEY')
    ?: (isset($_SERVER['VITE_GOOGLE_MAPS_API_KEY']) ? $_SERVER['VITE_GOOGLE_MAPS_API_KEY'] : '')
    ?: (isset($_SERVER['GOOGLE_MAPS_API_KEY']) ? $_SERVER['GOOGLE_MAPS_API_KEY'] : '')
    ?: (isset($_SERVER['REDIRECT_VITE_GOOGLE_MAPS_API_KEY']) ? $_SERVER['REDIRECT_VITE_GOOGLE_MAPS_API_KEY'] : '')
    ?: (isset($_SERVER['REDIRECT_GOOGLE_MAPS_API_KEY']) ? $_SERVER['REDIRECT_GOOGLE_MAPS_API_KEY'] : '')
    ?: (isset($_ENV['VITE_GOOGLE_MAPS_API_KEY']) ? $_ENV['VITE_GOOGLE_MAPS_API_KEY'] : '')
    ?: (isset($_ENV['GOOGLE_MAPS_API_KEY']) ? $_ENV['GOOGLE_MAPS_API_KEY'] : '')
    ?: (function_exists('apache_getenv') ? (apache_getenv('VITE_GOOGLE_MAPS_API_KEY') ?: apache_getenv('GOOGLE_MAPS_API_KEY')) : '');

$envFCMServerKey = getenv('FCM_SERVER_KEY')
    ?: (isset($_SERVER['FCM_SERVER_KEY']) ? $_SERVER['FCM_SERVER_KEY'] : '')
    ?: (isset($_SERVER['REDIRECT_FCM_SERVER_KEY']) ? $_SERVER['REDIRECT_FCM_SERVER_KEY'] : '')
    ?: (isset($_ENV['FCM_SERVER_KEY']) ? $_ENV['FCM_SERVER_KEY'] : '')
    ?: (function_exists('apache_getenv') ? apache_getenv('FCM_SERVER_KEY') : '');

// 2. Optional secondary fallback for legacy keys.php if present
if (empty($envOpenAIKey) || empty($envGoogleMapsKey)) {
    $keyFiles = [
        __DIR__ . '/keys.php',
        __DIR__ . '/keys.local.php',
        __DIR__ . '/../keys.php'
    ];
    foreach ($keyFiles as $kf) {
        if (file_exists($kf) && is_readable($kf)) {
            @include_once $kf;
            if (empty($envOpenAIKey) && defined('RYYCO_HOSTINGER_OPENAI_KEY') && !empty(RYYCO_HOSTINGER_OPENAI_KEY)) {
                $envOpenAIKey = trim(RYYCO_HOSTINGER_OPENAI_KEY);
            }
            if (empty($envGoogleMapsKey) && defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY') && !empty(RYYCO_HOSTINGER_GOOGLE_MAPS_KEY)) {
                $envGoogleMapsKey = trim(RYYCO_HOSTINGER_GOOGLE_MAPS_KEY);
            }
        }
    }
}

// Optionally load from local .env files across all possible Hostinger directories
if (empty($envOpenAIKey) || empty($envGoogleMapsKey) || empty($envFCMServerKey)) {
    $searchDirs = [
        __DIR__,
        dirname(__DIR__),
        dirname(dirname(__DIR__)),
        dirname(dirname(dirname(__DIR__))),
        dirname(dirname(dirname(dirname(__DIR__)))),
        isset($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/\\') : null,
        isset($_SERVER['DOCUMENT_ROOT']) ? dirname(rtrim($_SERVER['DOCUMENT_ROOT'], '/\\')) : null,
        isset($_SERVER['DOCUMENT_ROOT']) ? dirname(dirname(rtrim($_SERVER['DOCUMENT_ROOT'], '/\\'))) : null,
        getcwd()
    ];

    $fileNames = ['.env', '.env.local', '.env.production'];
    $checkedFiles = [];
    $GLOBALS['ryyco_checked_env_paths'] = [];

    foreach ($searchDirs as $dir) {
        if (!$dir || !is_dir($dir)) continue;
        foreach ($fileNames as $fn) {
            $path = rtrim($dir, '/\\') . '/' . $fn;
            if (isset($checkedFiles[$path])) continue;
            $checkedFiles[$path] = true;

            $exists = @file_exists($path);
            $GLOBALS['ryyco_checked_env_paths'][$path] = $exists ? 'found' : 'not_found';

            if ($exists && @is_readable($path)) {
                $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines) {
                    foreach ($lines as $line) {
                        $trimmed = trim($line);
                        if (empty($trimmed) || strpos($trimmed, '#') === 0) continue;
                        if (preg_match('/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(["\']?)(.*?)\2\s*$/', $trimmed, $matches)) {
                            $varName = $matches[1];
                            $varVal = trim($matches[3]);
                            if (empty($varVal)) continue;

                            if ($varName === 'OPENAI_API_KEY' && empty($envOpenAIKey)) {
                                $envOpenAIKey = $varVal;
                            } elseif (($varName === 'VITE_GOOGLE_MAPS_API_KEY' || $varName === 'GOOGLE_MAPS_API_KEY') && empty($envGoogleMapsKey)) {
                                $envGoogleMapsKey = $varVal;
                            } elseif ($varName === 'FCM_SERVER_KEY' && empty($envFCMServerKey)) {
                                $envFCMServerKey = $varVal;
                            }
                        }
                    }
                }
            }
        }
    }
}

define('RYYCO_OPENAI_API_KEY', $envOpenAIKey ?: '');
define('RYYCO_GOOGLE_MAPS_API_KEY', $envGoogleMapsKey ?: '');
define('RYYCO_FCM_SERVER_KEY', $envFCMServerKey ?: '');

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

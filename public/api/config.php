<?php
/**
 * RYYCO API Configuration & Environment Loader for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */

// 1. Universal CORS and JSON Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD');
header('Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// 2. Automatically load "keys.php", "apis.php" or "apis" file if present
function loadHostingerApisDefinition() {
    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
    $cwd = getcwd() ?: '';
    $apiFiles = [
        // Primary Hostinger configuration file: keys.php
        __DIR__ . '/keys.php',
        __DIR__ . '/../keys.php',
        __DIR__ . '/../../keys.php',
        dirname(__DIR__, 2) . '/keys.php',
        dirname(__DIR__, 3) . '/keys.php',
        $cwd . '/keys.php',
        $cwd . '/api/keys.php',
        $cwd . '/public/keys.php',
        $cwd . '/public/api/keys.php',
        $docRoot . '/keys.php',
        $docRoot . '/api/keys.php',
        $docRoot . '/public_html/keys.php',
        $docRoot . '/public_html/api/keys.php',
        
        // Secondary / backward-compatible aliases: apis.php and apis
        __DIR__ . '/apis.php',
        __DIR__ . '/apis',
        __DIR__ . '/../apis.php',
        __DIR__ . '/../apis',
        __DIR__ . '/../../apis.php',
        __DIR__ . '/../../apis',
        dirname(__DIR__, 2) . '/apis.php',
        dirname(__DIR__, 2) . '/apis',
        $cwd . '/apis.php',
        $cwd . '/apis',
        $cwd . '/api/apis.php',
        $cwd . '/public/apis.php',
        $docRoot . '/api/apis.php',
        $docRoot . '/api/apis',
        $docRoot . '/apis.php',
        $docRoot . '/apis',
        $docRoot . '/public_html/api/apis.php',
        $docRoot . '/public_html/api/apis',
        $docRoot . '/public_html/apis.php',
        $docRoot . '/public_html/apis'
    ];

    foreach ($apiFiles as $file) {
        if (!empty($file) && file_exists($file) && is_readable($file)) {
            @include_once $file;
        }
    }

    // Map RYYCO_HOSTINGER_* constants to standard environment variables
    if (defined('RYYCO_HOSTINGER_OPENAI_KEY') && !empty(constant('RYYCO_HOSTINGER_OPENAI_KEY'))) {
        $val = trim(constant('RYYCO_HOSTINGER_OPENAI_KEY'));
        putenv("OPENAI_API_KEY=$val");
        $_ENV['OPENAI_API_KEY'] = $val;
        $_SERVER['OPENAI_API_KEY'] = $val;
    }

    if (defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY') && !empty(constant('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY'))) {
        $val = trim(constant('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY'));
        putenv("GOOGLE_MAPS_API_KEY=$val");
        putenv("VITE_GOOGLE_MAPS_API_KEY=$val");
        $_ENV['GOOGLE_MAPS_API_KEY'] = $val;
        $_ENV['VITE_GOOGLE_MAPS_API_KEY'] = $val;
        $_SERVER['GOOGLE_MAPS_API_KEY'] = $val;
        $_SERVER['VITE_GOOGLE_MAPS_API_KEY'] = $val;
    }

    if (defined('RYYCO_HOSTINGER_FCM_SERVER_KEY') && !empty(constant('RYYCO_HOSTINGER_FCM_SERVER_KEY'))) {
        $val = trim(constant('RYYCO_HOSTINGER_FCM_SERVER_KEY'));
        putenv("FCM_SERVER_KEY=$val");
        $_ENV['FCM_SERVER_KEY'] = $val;
        $_SERVER['FCM_SERVER_KEY'] = $val;
    }
}

loadHostingerApisDefinition();

// 3. Automatically load .env file from common directories on Hostinger
function loadEnvFile() {
    $searchPaths = [
        __DIR__ . '/.env',
        __DIR__ . '/../.env',
        __DIR__ . '/../../.env',
        ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/.env',
        ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/../.env'
    ];

    foreach ($searchPaths as $path) {
        if (!empty($path) && file_exists($path) && is_readable($path)) {
            $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines !== false) {
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if ($trimmed === '' || strpos($trimmed, '#') === 0) {
                        continue;
                    }
                    $parts = explode('=', $trimmed, 2);
                    if (count($parts) === 2) {
                        $key = trim($parts[0]);
                        $val = trim($parts[1]);
                        // Remove surrounding quotes if present
                        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                            (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                            $val = substr($val, 1, -1);
                        }
                        if (!getenv($key)) {
                            putenv("$key=$val");
                            $_ENV[$key] = $val;
                            $_SERVER[$key] = $val;
                        }
                    }
                }
                break; // Stop after first valid .env found
            }
        }
    }
}

loadEnvFile();

/**
 * Safely retrieve an environment variable (from RYYCO_HOSTINGER constants, getenv, $_ENV, $_SERVER or Apache)
 */
function getApiKey(string $key, string $default = ''): string {
    // 1. Direct check against Hostinger constants
    if ($key === 'OPENAI_API_KEY' && defined('RYYCO_HOSTINGER_OPENAI_KEY')) {
        $cVal = trim(constant('RYYCO_HOSTINGER_OPENAI_KEY'));
        if (!empty($cVal)) return $cVal;
    }
    if (($key === 'GOOGLE_MAPS_API_KEY' || $key === 'VITE_GOOGLE_MAPS_API_KEY') && defined('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY')) {
        $cVal = trim(constant('RYYCO_HOSTINGER_GOOGLE_MAPS_KEY'));
        if (!empty($cVal)) return $cVal;
    }
    if ($key === 'FCM_SERVER_KEY' && defined('RYYCO_HOSTINGER_FCM_SERVER_KEY')) {
        $cVal = trim(constant('RYYCO_HOSTINGER_FCM_SERVER_KEY'));
        if (!empty($cVal)) return $cVal;
    }

    // 2. Environment variables check
    $val = getenv($key);
    if ($val !== false && trim($val) !== '') {
        return trim($val);
    }
    if (isset($_ENV[$key]) && trim($_ENV[$key]) !== '') {
        return trim($_ENV[$key]);
    }
    if (isset($_SERVER[$key]) && trim($_SERVER[$key]) !== '') {
        return trim($_SERVER[$key]);
    }
    if (isset($_SERVER['REDIRECT_' . $key]) && trim($_SERVER['REDIRECT_' . $key]) !== '') {
        return trim($_SERVER['REDIRECT_' . $key]);
    }
    return $default;
}

/**
 * Execute HTTP POST with JSON payload using cURL with resilient SSL and stream fallback
 */
function curlJsonPost(string $url, array $payload, array $headers = [], int $timeout = 60): array {
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $defaultHeaders = [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Ryyco-Hostinger-API/1.0'
    ];
    $mergedHeaders = array_merge($defaultHeaders, $headers);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $mergedHeaders,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => true,
            // On Hostinger shared hosting, missing local CA bundle causes cURL error 60.
            // We disable peer verification to ensure reliable communication with OpenAI/Google.
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0
        ]);

        $raw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($raw !== false && $httpCode > 0) {
            return [
                'status' => $httpCode,
                'body' => $raw,
                'error' => $curlError
            ];
        }
    }

    // Stream context fallback if cURL fails or is disabled
    $headerStr = implode("\r\n", $mergedHeaders);
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => $headerStr,
            'content' => $json,
            'timeout' => $timeout,
            'ignore_errors' => true
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false
        ]
    ]);

    $raw = @file_get_contents($url, false, $ctx);
    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        if (preg_match('/HTTP\/\S+\s+(\d+)/', $http_response_header[0], $matches)) {
            $httpCode = (int)$matches[1];
        }
    }

    return [
        'status' => $httpCode,
        'body' => $raw ?: '',
        'error' => ($raw === false) ? 'HTTP stream request failed on Hostinger' : ''
    ];
}

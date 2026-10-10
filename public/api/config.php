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

// 2. Automatically load .env file from common directories on Hostinger
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
 * Safely retrieve an environment variable (from getenv, $_ENV, $_SERVER or Apache)
 */
function getApiKey(string $key, string $default = ''): string {
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
 * Execute HTTP POST with JSON payload using cURL
 */
function curlJsonPost(string $url, array $payload, array $headers = [], int $timeout = 60): array {
    $ch = curl_init($url);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $defaultHeaders = [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Ryyco-Hostinger-API/1.0'
    ];
    $mergedHeaders = array_merge($defaultHeaders, $headers);

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $json,
        CURLOPT_HTTPHEADER => $mergedHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $raw = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    return [
        'status' => $httpCode,
        'body' => $raw,
        'error' => $curlError
    ];
}

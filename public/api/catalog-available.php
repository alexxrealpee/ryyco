<?php
/**
 * RYYCO Available Catalog Endpoint for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$cachePaths = [
    __DIR__ . '/../catalog-cache.json',
    __DIR__ . '/catalog-cache.json',
    ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/catalog-cache.json'
];

foreach ($cachePaths as $path) {
    if (file_exists($path) && is_readable($path)) {
        readfile($path);
        exit(0);
    }
}

echo json_encode([
    'products' => [],
    'stores' => [],
    'timestamp' => date('c')
]);

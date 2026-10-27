<?php
/**
 * RYYCO Available Catalog Endpoint for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/catalog-live.php';
header('Access-Control-Allow-Origin: *');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Each request confirms current data with Firestore. Only image bytes are cached.
// A failed live query falls back to an explicitly UNCONFIRMED static preview.
try {
    $initial = in_array($_GET['initial'] ?? '', ['true', '1'], true);
    $catalog = catalogExternalize(catalogReadLive($initial ? 18 : 0), __DIR__ . '/../catalog-images');
    $storeId = trim((string)($_GET['storeId'] ?? ''));
    $username = strtolower(trim((string)($_GET['storeUsername'] ?? '')));
    $filtered = $storeId !== '' || $username !== '';
    if ($filtered) {
        $catalog['products'] = array_values(array_filter($catalog['products'], fn($p) =>
            ($storeId !== '' && ($p['userId'] ?? '') === $storeId) ||
            ($username !== '' && strtolower($p['storeUsername'] ?? '') === $username)));
        $catalog['stores'] = array_values(array_filter($catalog['stores'], fn($s) =>
            ($storeId !== '' && ($s['uid'] ?? '') === $storeId) ||
            ($username !== '' && strtolower($s['username'] ?? '') === $username)));
    }
    $total = count($catalog['products']);
    $initial = in_array($_GET['initial'] ?? '', ['true', '1'], true);
    $limit = $initial ? 18 : max(0, (int)($_GET['limit'] ?? 0));
    $partial = $limit > 0 && $total > $limit;
    if ($partial) $catalog['products'] = array_slice($catalog['products'], 0, $limit);
    echo json_encode(['success' => true, 'source' => 'firestore-server', 'complete' => !$initial && !$partial && !$filtered, 'storesComplete' => !$filtered,
        'isPartial' => $initial || $partial, 'storeFiltered' => $filtered, 'totalProducts' => $initial ? null : $total,
        'confirmedAt' => gmdate('c'), 'catalog' => $catalog], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
} catch (Throwable $error) {
    // Never label stale files as current, or expose server diagnostics to visitors.
}

$cachePaths = [
    __DIR__ . '/../catalog-cache.json',
    __DIR__ . '/catalog-cache.json',
    ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/catalog-cache.json'
];

foreach ($cachePaths as $path) {
    if (file_exists($path) && is_readable($path)) {
        $data = json_decode(file_get_contents($path), true);
        if (!is_array($data) || !isset($data['catalog'])) continue;
        $catalog = $data['catalog'];
        $products = $catalog['products'] ?? [];
        $stores = $catalog['stores'] ?? [];
        $initial = in_array($_GET['initial'] ?? '', ['true', '1'], true);
        $limit = $initial ? 6 : max(0, (int)($_GET['limit'] ?? 0));
        $storeId = trim((string)($_GET['storeId'] ?? ''));
        $username = strtolower(trim((string)($_GET['storeUsername'] ?? '')));
        if ($storeId !== '' || $username !== '') {
            $products = array_values(array_filter($products, function ($product) use ($storeId, $username) {
                return ($storeId !== '' && ($product['userId'] ?? '') === $storeId)
                    || ($username !== '' && strtolower($product['storeUsername'] ?? '') === $username);
            }));
            $stores = array_values(array_filter($stores, function ($store) use ($storeId, $username) {
                return ($storeId !== '' && ($store['uid'] ?? '') === $storeId)
                    || ($username !== '' && strtolower($store['username'] ?? '') === $username);
            }));
        }
        $data['success'] = true;
        // This endpoint reads a static file, not a confirmed Firestore snapshot.
        $data['source'] = 'static-cache';
        $data['complete'] = false;
        $data['catalog']['complete'] = false;
        $data['totalProducts'] = count($products);
        $data['isPartial'] = $limit > 0 && count($products) > $limit;
        $data['catalog']['products'] = $limit > 0 ? array_slice($products, 0, $limit) : $products;
        $data['catalog']['stores'] = $stores;
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

echo json_encode([
    'success' => false,
    'source' => 'static-cache',
    'complete' => false,
    'catalog' => ['products' => [], 'stores' => []],
    'timestamp' => date('c')
]);

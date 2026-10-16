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
        $data['isPartial'] = $limit > 0 && count($products) > $limit;
        $data['catalog']['products'] = $limit > 0 ? array_slice($products, 0, $limit) : $products;
        $data['catalog']['stores'] = $stores;
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

echo json_encode([
    'success' => true,
    'catalog' => ['products' => [], 'stores' => []],
    'timestamp' => date('c')
]);

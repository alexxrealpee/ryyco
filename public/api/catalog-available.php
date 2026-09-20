<?php
/**
 * Ryyco Dynamic Catalog API for Hostinger Apache Environments
 * Delivers optimized catalog with instant caching and GZIP compression.
 */

// Enable compression if not already active
if (!ob_get_level()) {
    if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
        @ob_start('ob_gzhandler');
    } else {
        @ob_start();
    }
}

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=180');

$isInitial = isset($_GET['initial']) && ($_GET['initial'] === 'true' || $_GET['initial'] === '1');
$limitQuery = isset($_GET['limit']) ? intval($_GET['limit']) : 0;
$limit = $isInitial ? 10 : $limitQuery;

$cacheFile = __DIR__ . '/catalog-cache.json';
if (!file_exists($cacheFile)) {
    $cacheFile = __DIR__ . '/../catalog-cache.json';
}

$catalog = null;
$cacheMaxAge = 180; // 3 minutes cache lifetime

if (file_exists($cacheFile)) {
    $mtime = filemtime($cacheFile);
    if ((time() - $mtime) < $cacheMaxAge) {
        $raw = @file_get_contents($cacheFile);
        if ($raw) {
            $parsed = @json_decode($raw, true);
            if (isset($parsed['catalog']['stores']) && isset($parsed['catalog']['products'])) {
                $catalog = $parsed['catalog'];
            } elseif (isset($parsed['stores']) && isset($parsed['products'])) {
                $catalog = $parsed;
            }
        }
    }
}

// If no valid fresh cache, attempt to refresh from Firestore REST API
if (!$catalog) {
    $projectId = "studio-9002217802-13e05";
    $profilesUrl = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/(default)/documents/profiles?pageSize=100";
    $productsUrl = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/(default)/documents/products?pageSize=300";

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 4,
            'header' => "Accept: application/json\r\nUser-Agent: Ryyco-Hostinger/1.0\r\n"
        ]
    ]);

    $profilesRaw = @file_get_contents($profilesUrl, false, $ctx);
    $productsRaw = @file_get_contents($productsUrl, false, $ctx);

    if ($profilesRaw && $productsRaw) {
        $profilesData = @json_decode($profilesRaw, true);
        $productsData = @json_decode($productsRaw, true);

        $stores = [];
        $openStoreUids = [];
        $openStoreUsernames = [];

        if (isset($profilesData['documents']) && is_array($profilesData['documents'])) {
            foreach ($profilesData['documents'] as $doc) {
                $fields = isset($doc['fields']) ? $doc['fields'] : [];
                $nameParts = explode('/', $doc['name']);
                $docId = end($nameParts);

                $getString = function($f, $k, $def = '') {
                    return isset($f[$k]['stringValue']) ? $f[$k]['stringValue'] : $def;
                };
                $getBool = function($f, $k, $def = false) {
                    return isset($f[$k]['booleanValue']) ? $f[$k]['booleanValue'] : $def;
                };
                $getNum = function($f, $k, $def = 0) {
                    if (isset($f[$k]['integerValue'])) return intval($f[$k]['integerValue']);
                    if (isset($f[$k]['doubleValue'])) return floatval($f[$k]['doubleValue']);
                    return $def;
                };

                $uid = $getString($fields, 'uid', $docId);
                $username = $getString($fields, 'username', $uid);
                $displayName = $getString($fields, 'displayName', $getString($fields, 'storeName', $username));
                $isSuspended = $getBool($fields, 'suspended', false) || 
                               ($getString($fields, 'subscriptionStatus') === 'suspended') || 
                               ($getString($fields, 'subscriptionStatus') === 'expired');
                $isClosed = $isSuspended || $getBool($fields, 'isClosed', false);

                if (!$isClosed && !$isSuspended) {
                    $stores[] = [
                        'uid' => $uid,
                        'username' => $username,
                        'displayName' => $displayName,
                        'bio' => $getString($fields, 'bio'),
                        'address' => $getString($fields, 'address'),
                        'phone' => $getString($fields, 'phone'),
                        'whatsapp' => $getString($fields, 'whatsapp'),
                        'photoURL' => $getString($fields, 'photoURL'),
                        'deliveryFee' => $getNum($fields, 'deliveryFee', 7000),
                        'isClosed' => false,
                        'suspended' => false
                    ];
                    $openStoreUids[$uid] = true;
                    if (!empty($username)) {
                        $openStoreUsernames[strtolower($username)] = true;
                    }
                }
            }
        }

        $products = [];
        if (isset($productsData['documents']) && is_array($productsData['documents'])) {
            foreach ($productsData['documents'] as $doc) {
                $fields = isset($doc['fields']) ? $doc['fields'] : [];
                $nameParts = explode('/', $doc['name']);
                $docId = end($nameParts);

                $getString = function($f, $k, $def = '') {
                    return isset($f[$k]['stringValue']) ? $f[$k]['stringValue'] : $def;
                };
                $getBool = function($f, $k, $def = true) {
                    return isset($f[$k]['booleanValue']) ? $f[$k]['booleanValue'] : $def;
                };
                $getNum = function($f, $k, $def = 0) {
                    if (isset($f[$k]['integerValue'])) return intval($f[$k]['integerValue']);
                    if (isset($f[$k]['doubleValue'])) return floatval($f[$k]['doubleValue']);
                    return $def;
                };

                $userId = $getString($fields, 'userId');
                $storeUsername = $getString($fields, 'storeUsername');
                $active = $getBool($fields, 'active', true);

                $isOpenStore = (isset($openStoreUids[$userId])) || 
                               (!empty($storeUsername) && isset($openStoreUsernames[strtolower($storeUsername)]));

                if ($active && $isOpenStore) {
                    $products[] = [
                        'id' => $docId,
                        'userId' => $userId,
                        'name' => $getString($fields, 'name', 'Producto'),
                        'description' => $getString($fields, 'description'),
                        'price' => $getNum($fields, 'price', 0),
                        'stock' => $getNum($fields, 'stock', 99),
                        'category' => $getString($fields, 'category', 'General'),
                        'imageURL' => $getString($fields, 'imageURL'),
                        'storeName' => $getString($fields, 'storeName'),
                        'storeUsername' => $storeUsername,
                        'active' => true
                    ];
                }
            }
        }

        $catalog = [
            'stores' => $stores,
            'products' => $products,
            'catalogUpdatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'version' => time()
        ];

        // Write to local cache file for next requests
        $payloadToCache = json_encode([
            'success' => true,
            'catalog' => $catalog,
            'catalogUpdatedAt' => $catalog['catalogUpdatedAt'],
            'version' => $catalog['version']
        ]);
        @file_put_contents($cacheFile, $payloadToCache);
    }
}

// Fallback: If still no catalog, load stale cache if present
if (!$catalog && file_exists($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    if ($raw) {
        $parsed = @json_decode($raw, true);
        $catalog = isset($parsed['catalog']) ? $parsed['catalog'] : $parsed;
    }
}

if (!$catalog) {
    echo json_encode([
        'success' => false,
        'catalog' => ['stores' => [], 'products' => []],
        'error' => 'Catalog could not be retrieved'
    ]);
    exit;
}

if ($limit > 0 && isset($catalog['products']) && count($catalog['products']) > $limit) {
    $partialProducts = array_slice($catalog['products'], 0, $limit);
    echo json_encode([
        'success' => true,
        'catalog' => array_merge($catalog, ['products' => $partialProducts]),
        'catalogUpdatedAt' => isset($catalog['catalogUpdatedAt']) ? $catalog['catalogUpdatedAt'] : gmdate('Y-m-d\TH:i:s\Z'),
        'version' => isset($catalog['version']) ? $catalog['version'] : 1,
        'isPartial' => true
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'catalog' => $catalog,
    'catalogUpdatedAt' => isset($catalog['catalogUpdatedAt']) ? $catalog['catalogUpdatedAt'] : gmdate('Y-m-d\TH:i:s\Z'),
    'version' => isset($catalog['version']) ? $catalog['version'] : 1
]);

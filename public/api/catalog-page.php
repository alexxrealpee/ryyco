<?php
require_once __DIR__ . '/catalog-live.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
try {
    $kind = $_GET['kind'] ?? 'products';
    if (!in_array($kind, ['stores', 'products', 'categories'], true)) throw new InvalidArgumentException('kind');
    // Categoría global (ej. desayunos): solo productos ya clasificados en ella.
    $globalCategory = (string)($_GET['category'] ?? '');
    if ($globalCategory !== '' && ($kind !== 'products' || !preg_match('/^[a-z-]{2,40}$/D', $globalCategory))) throw new InvalidArgumentException('category');
    if ($kind === 'categories') {
        // Qué categorías globales tienen productos activos y de qué restaurantes (sin fotos, sin
        // descargar productos completos). El navegador cruza esto con los restaurantes abiertos.
        $cacheFile = sys_get_temp_dir() . '/ryyco-global-categories.json';
        if (is_file($cacheFile) && time() - filemtime($cacheFile) < 60) {
            header('Cache-Control: no-store');
            readfile($cacheFile);
            exit;
        }
        $baseUrl = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents';
        $map = [];
        $after = null;
        for ($page = 0; $page < 20; $page++) {
            $query = ['from' => [['collectionId' => 'products']],
                'select' => ['fields' => [['fieldPath' => 'globalCategoryIds'], ['fieldPath' => 'userId'], ['fieldPath' => 'active']]],
                'where' => ['fieldFilter' => ['field' => ['fieldPath' => 'classificationStatus'], 'op' => 'EQUAL',
                    'value' => ['stringValue' => 'classified']]],
                'orderBy' => [['field' => ['fieldPath' => '__name__'], 'direction' => 'ASCENDING']], 'limit' => 500];
            if ($after) $query['startAt'] = ['before' => false, 'values' => [['referenceValue' => $after]]];
            $rows = catalogHttpJson($baseUrl . ':runQuery', ['structuredQuery' => $query]);
            $docs = array_values(array_filter($rows, fn($r) => isset($r['document'])));
            foreach ($docs as $row) {
                $fields = catalogDecodeFields($row['document']['fields'] ?? []);
                if (($fields['active'] ?? true) === false || empty($fields['userId'])) continue;
                foreach ((array)($fields['globalCategoryIds'] ?? []) as $id) {
                    if (is_string($id) && preg_match('/^[a-z-]{2,40}$/D', $id)) $map[$id][$fields['userId']] = true;
                }
            }
            if (count($docs) < 500) break;
            $after = $docs[count($docs) - 1]['document']['name'];
        }
        $out = [];
        foreach ($map as $id => $stores) $out[$id] = array_keys($stores);
        $json = json_encode(['source' => 'firestore-server', 'kind' => 'categories', 'categories' => (object)$out,
            'confirmedAt' => gmdate('c')], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        @file_put_contents($cacheFile, $json, LOCK_EX);
        header('Cache-Control: no-store');
        echo $json;
        exit;
    }
    $collection = $kind === 'stores' ? 'profiles' : 'products';
    $limit = min(24, max(1, (int)($_GET['limit'] ?? 12)));
    $after = (string)($_GET['after'] ?? '');
    if ($after !== '' && !preg_match('/^[A-Za-z0-9_.@ -]{1,150}$/D', $after)) throw new InvalidArgumentException('cursor');
    $storeId = $_GET['storeId'] ?? '';
    $storeUsername = $_GET['storeUsername'] ?? '';
    if (!is_string($storeId) || !is_string($storeUsername) ||
        ($storeId !== '' && ($kind !== 'products' || !preg_match('/^[A-Za-z0-9_.@ -]{1,150}$/D', $storeId))) ||
        ($storeUsername !== '' && ($storeId === '' || strlen($storeUsername) > 150))) {
        throw new InvalidArgumentException('store');
    }
    $profileFields = ['uid','email','createdAt','role','plan','subscriptionPlan','subscriptionAnchorDay','username','displayName','storeName','bio','currency','category','layout','isClosed','suspended','archived',
        'subscriptionStatus','subscriptionTrialExpires','subscriptionPaidUntil','scheduleEnabled','openTime','closeTime',
        'restaurantDaysOpen','weeklySchedule','phone','whatsapp','customerServiceWhatsapp','ownerWhatsapp','address','mapUrl','restaurantReference',
        'lat','lng','restaurantAcceptsDelivery','restaurantAcceptsTakeaway','restaurantPaymentMethods','restaurantDeliveryTime',
        'restaurantAddress','restaurantCity','rating','ratingCount',
        // Checkout (cuentas bancarias) y seguimiento (ubicación) de la tienda general.
        'bankAccounts','location','latitude','longitude'];
    $productFields = ['userId','name','description','price','compareAtPrice','packagingCost','category','stock',
        'variantsText','variantsList','variantPrices','hasFlavors','allowsHalfAndHalf','flavorsText','flavorsList',
        'allowSingleFlavor','addons','active','storeName','storeUsername','createdAt','imageFileName',
        // Categorías globales del inicio (las asigna el clasificador; no cambian la categoría interna).
        'globalCategoryIds','globalMealTags','classificationStatus'];
    $query = ['from'=>[['collectionId'=>$collection]],
        'select'=>['fields'=>array_map(fn($f)=>['fieldPath'=>$f], $kind === 'stores' ? $profileFields : $productFields)],
        'orderBy'=>[['field'=>['fieldPath'=>'__name__'],'direction'=>'ASCENDING']]];
    $base = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents';
    if ($kind === 'products') {
        $query['limit'] = $limit;
        if ($after !== '') $query['startAt'] = ['before'=>false,'values'=>[['referenceValue'=>substr($base, strlen('https://firestore.googleapis.com/v1/')) . '/products/' . $after]]];
        if ($globalCategory !== '') {
            $query['where'] = ['fieldFilter'=>['field'=>['fieldPath'=>'globalCategoryIds'], 'op'=>'ARRAY_CONTAINS', 'value'=>['stringValue'=>$globalCategory]]];
        }
        if ($storeId !== '' && $globalCategory === '') {
            $equals = fn($field, $value) => ['fieldFilter'=>['field'=>['fieldPath'=>$field], 'op'=>'EQUAL', 'value'=>['stringValue'=>$value]]];
            $filters = [$equals('userId', $storeId)];
            foreach (array_unique([$storeUsername, strtolower(trim($storeUsername))]) as $username) {
                if ($username === '') continue;
                if ($username !== $storeId) $filters[] = $equals('userId', $username);
                $filters[] = $equals('storeUsername', $username);
            }
            $query['where'] = count($filters) === 1 ? $filters[0] : ['compositeFilter'=>['op'=>'OR', 'filters'=>$filters]];
        }
    }
    $rows = catalogHttpJson($base . ':runQuery', ['structuredQuery'=>$query]);
    $items = catalogDocuments($rows, $collection);
    $documents = array_values(array_filter($rows, fn($r)=>isset($r['document'])));
    foreach ($items as $index => &$item) {
        $doc = $documents[$index]['document'];
        $id = basename($doc['name']);
        $version = $doc['updateTime'] ?? '';
        $item[$kind === 'stores' ? 'photoURL' : 'imageURL'] = '/api/catalog-image.php?' . http_build_query(['kind'=>$kind,'id'=>$id,'v'=>$version]);
        // QR de pago en base64 (~130 KB en total): se sirven como archivos cacheados
        // en /catalog-images/ para que la consulta periódica de tiendas siga siendo liviana.
        if ($kind === 'stores' && isset($item['bankAccounts'])) {
            $item['bankAccounts'] = catalogExternalize($item['bankAccounts'], __DIR__ . '/../catalog-images');
        }
    }
    unset($item);
    $count = count($items);
    $last = $count ? basename($documents[$count-1]['document']['name']) : null;
    echo json_encode(['source'=>'firestore-server','kind'=>$kind,'items'=>$items,
        ...($storeId !== '' ? ['storeId'=>$storeId] : []),
        ...($globalCategory !== '' ? ['category'=>$globalCategory] : []),
        'hasMore'=>$kind === 'products' && $count === $limit,'cursor'=>$last,'confirmedAt'=>gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException ? 400 : 503);
    echo json_encode(['error'=>'No se pudo consultar el catálogo en vivo.']);
}

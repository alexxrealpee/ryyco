<?php
require_once __DIR__ . '/catalog-live.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
try {
    $kind = $_GET['kind'] ?? 'products';
    if (!in_array($kind, ['stores', 'products'], true)) throw new InvalidArgumentException('kind');
    $collection = $kind === 'stores' ? 'profiles' : 'products';
    $limit = min(24, max(1, (int)($_GET['limit'] ?? 12)));
    $after = (string)($_GET['after'] ?? '');
    if ($after !== '' && !preg_match('/^[A-Za-z0-9_.@ -]{1,150}$/D', $after)) throw new InvalidArgumentException('cursor');
    $profileFields = ['uid','username','displayName','storeName','currency','category','layout','isClosed','suspended',
        'subscriptionStatus','subscriptionTrialExpires','subscriptionPaidUntil','scheduleEnabled','openTime','closeTime',
        'restaurantDaysOpen','weeklySchedule','phone','whatsapp','customerServiceWhatsapp','ownerWhatsapp','address',
        'lat','lng','restaurantAcceptsDelivery','restaurantAcceptsTakeaway','restaurantPaymentMethods','restaurantDeliveryTime',
        'restaurantAddress','restaurantCity','rating','ratingCount'];
    $productFields = ['userId','name','description','price','compareAtPrice','packagingCost','category','stock',
        'variantsText','variantsList','variantPrices','hasFlavors','allowsHalfAndHalf','flavorsText','flavorsList',
        'allowSingleFlavor','addons','active','storeName','storeUsername','createdAt','imageFileName'];
    $query = ['from'=>[['collectionId'=>$collection]],
        'select'=>['fields'=>array_map(fn($f)=>['fieldPath'=>$f], $kind === 'stores' ? $profileFields : $productFields)],
        'orderBy'=>[['field'=>['fieldPath'=>'__name__'],'direction'=>'ASCENDING']]];
    $base = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents';
    if ($kind === 'products') {
        $query['limit'] = $limit;
        if ($after !== '') $query['startAt'] = ['before'=>false,'values'=>[['referenceValue'=>substr($base, strlen('https://firestore.googleapis.com/v1/')) . '/products/' . $after]]];
    }
    $rows = catalogHttpJson($base . ':runQuery', ['structuredQuery'=>$query]);
    $items = catalogDocuments($rows, $collection);
    $documents = array_values(array_filter($rows, fn($r)=>isset($r['document'])));
    foreach ($items as $index => &$item) {
        $doc = $documents[$index]['document'];
        $id = basename($doc['name']);
        $version = $doc['updateTime'] ?? '';
        $item[$kind === 'stores' ? 'photoURL' : 'imageURL'] = '/api/catalog-image.php?' . http_build_query(['kind'=>$kind,'id'=>$id,'v'=>$version]);
    }
    unset($item);
    $count = count($items);
    $last = $count ? basename($documents[$count-1]['document']['name']) : null;
    echo json_encode(['source'=>'firestore-server','kind'=>$kind,'items'=>$items,
        'hasMore'=>$kind === 'products' && $count === $limit,'cursor'=>$last,'confirmedAt'=>gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException ? 400 : 503);
    echo json_encode(['error'=>'No se pudo consultar el catálogo en vivo.']);
}

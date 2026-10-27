<?php
// Public Firestore reads only. No service-account credentials or persisted availability.
function catalogDecodeValue(array $value) {
    if (isset($value['mapValue'])) return catalogDecodeFields($value['mapValue']['fields'] ?? []);
    if (isset($value['arrayValue'])) return array_map('catalogDecodeValue', $value['arrayValue']['values'] ?? []);
    if (isset($value['integerValue'])) return (int)$value['integerValue'];
    if (isset($value['doubleValue'])) return (float)$value['doubleValue'];
    foreach (['stringValue', 'booleanValue', 'timestampValue', 'geoPointValue', 'referenceValue'] as $type) {
        if (array_key_exists($type, $value)) return $value[$type];
    }
    return null;
}

function catalogDecodeFields(array $fields): array {
    $result = [];
    foreach ($fields as $key => $value) $result[$key] = catalogDecodeValue($value);
    return $result;
}

function catalogDocuments(array $rows, string $collection): array {
    $result = [];
    foreach ($rows as $row) {
        if (isset($row['error'])) throw new RuntimeException('Firestore query failed');
        if (!isset($row['document'])) {
            if (!isset($row['readTime'])) throw new RuntimeException('Unconfirmed query');
            continue;
        }
        $doc = $row['document'];
        $item = catalogDecodeFields($doc['fields'] ?? []);
        $id = basename($doc['name']);
        if ($collection === 'profiles') $item['uid'] = $item['uid'] ?? $id;
        else $item['id'] = $id;
        $result[] = $item;
    }
    // Firestore returns a readTime row even for an empty collection.
    if (!$rows) throw new RuntimeException('Missing query confirmation');
    return $result;
}

function catalogExternalize($value, string $directory) {
    if (is_array($value)) {
        foreach ($value as $key => $item) $value[$key] = catalogExternalize($item, $directory);
        return $value;
    }
    if (!is_string($value) || !preg_match('~^data:image/(jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$~D', $value, $match)) return $value;
    $bytes = base64_decode($match[2], true);
    if ($bytes === false || strlen($bytes) > 5 * 1024 * 1024) return $value;
    $extension = $match[1] === 'jpeg' ? 'jpg' : $match[1];
    $name = hash('sha256', $bytes) . '.' . $extension;
    if (!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) return $value;
    $target = $directory . '/' . $name;
    if (!is_file($target)) {
        $temporary = @tempnam($directory, '.catalog-');
        if (!$temporary) return $value;
        if (@file_put_contents($temporary, $bytes) !== strlen($bytes) || !@rename($temporary, $target)) {
            @unlink($temporary);
            if (!is_file($target)) return $value;
        }
        @chmod($target, 0644);
    }
    return '/catalog-images/' . $name;
}

function catalogReadLive(int $productLimit = 0): array {
    if (!function_exists('curl_multi_init')) throw new RuntimeException('cURL unavailable');
    $url = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents:runQuery';
    $multi = curl_multi_init();
    $handles = [];
    try {
        foreach (['profiles', 'products'] as $collection) {
            $query = ['from' => [['collectionId' => $collection]]];
            if ($collection === 'profiles') {
                $fields = ['uid', 'username', 'displayName', 'storeName', 'photoURL', 'currency', 'category', 'layout',
                    'isClosed', 'suspended', 'subscriptionStatus', 'subscriptionTrialExpires', 'subscriptionPaidUntil',
                    'scheduleEnabled', 'openTime', 'closeTime', 'restaurantDaysOpen', 'weeklySchedule',
                    'phone', 'whatsapp', 'customerServiceWhatsapp', 'ownerWhatsapp', 'address', 'lat', 'lng',
                    'restaurantAcceptsDelivery', 'restaurantAcceptsTakeaway', 'restaurantPaymentMethods',
                    'restaurantDeliveryTime', 'restaurantAddress', 'restaurantCity', 'rating', 'ratingCount'];
                $query['select'] = ['fields' => array_map(fn($field) => ['fieldPath' => $field], $fields)];
            }
            if ($collection === 'products' && $productLimit > 0) $query['limit'] = $productLimit;
            $handle = curl_init($url);
            curl_setopt_array($handle, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode(['structuredQuery' => $query]),
                CURLOPT_RETURNTRANSFER => true, CURLOPT_ENCODING => '', CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2]);
            $handles[$collection] = $handle;
            curl_multi_add_handle($multi, $handle);
        }
        do {
            $status = curl_multi_exec($multi, $running);
            if ($status !== CURLM_OK) throw new RuntimeException('Transport failed');
            if ($running) curl_multi_select($multi, 0.2);
        } while ($running);
        $catalog = [];
        foreach ($handles as $collection => $handle) {
            if (curl_errno($handle) || curl_getinfo($handle, CURLINFO_RESPONSE_CODE) !== 200) throw new RuntimeException('Query unavailable');
            $rows = json_decode(curl_multi_getcontent($handle), true, 512, JSON_THROW_ON_ERROR);
            $items = catalogDocuments($rows, $collection);
            if ($collection === 'products') $items = array_values(array_filter($items, fn($p) => ($p['active'] ?? true) !== false));
            else {
                // These large fields are not used by the home catalog. Full profiles remain in the SDK listener.
                foreach ($items as &$item) unset($item['coverURL'], $item['bankAccounts'], $item['customTheme']);
                unset($item);
            }
            $catalog[$collection === 'profiles' ? 'stores' : 'products'] = $items;
        }
        return $catalog;
    } finally {
        foreach ($handles as $handle) { curl_multi_remove_handle($multi, $handle); curl_close($handle); }
        curl_multi_close($multi);
    }
}


function catalogHttpJson(string $url, ?array $body = null): array {
    if (!function_exists('curl_init')) throw new RuntimeException('cURL unavailable');
    $handle = curl_init($url);
    try {
        curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>6,
            CURLOPT_TIMEOUT=>10,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);
        if ($body !== null) curl_setopt_array($handle, [CURLOPT_POST=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode($body)]);
        $text = curl_exec($handle);
        if ($text === false || curl_getinfo($handle,CURLINFO_RESPONSE_CODE) !== 200) {
            error_log('Catalog transport: curl=' . curl_errno($handle) . ' http=' . curl_getinfo($handle,CURLINFO_RESPONSE_CODE) .
                ' dns=' . curl_getinfo($handle,CURLINFO_NAMELOOKUP_TIME) . ' connect=' . curl_getinfo($handle,CURLINFO_CONNECT_TIME) .
                ' tls=' . curl_getinfo($handle,CURLINFO_APPCONNECT_TIME) . ' ' . curl_error($handle));
            throw new RuntimeException('Firestore unavailable');
        }
        return json_decode($text,true,512,JSON_THROW_ON_ERROR);
    } finally { curl_close($handle); }
}

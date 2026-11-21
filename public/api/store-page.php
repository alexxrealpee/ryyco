<?php
/**
 * Datos públicos de la página de un restaurante (/usuario) en UNA respuesta:
 * perfil + productos + enlaces + tema.
 *
 * index.html lo pide apenas se abre la página, en paralelo con la descarga del
 * JavaScript. Las fotos guardadas en base64 dentro de Firestore (foto, portada,
 * productos, QR…) se convierten en archivos cacheados de /catalog-images/, así la
 * respuesta pesa unos KB en vez de cientos.
 *
 * Solo lecturas públicas (mismas reglas que la app sin sesión). Si algo falla, la
 * app carga los datos como antes con el SDK de Firebase.
 */
require_once __DIR__ . '/catalog-live.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const STORE_BASE = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents';

/** Igual que catalogDecodeValue, pero marca fechas y coordenadas para que el navegador las reconstruya. */
function storeDecodeValue(array $value) {
    if (isset($value['mapValue'])) return storeDecodeFields($value['mapValue']['fields'] ?? []);
    if (isset($value['arrayValue'])) return array_map('storeDecodeValue', $value['arrayValue']['values'] ?? []);
    if (isset($value['integerValue'])) return (int)$value['integerValue'];
    if (isset($value['doubleValue'])) return (float)$value['doubleValue'];
    if (array_key_exists('timestampValue', $value)) return ['__ryycoType' => 'timestamp', 'value' => $value['timestampValue']];
    if (isset($value['geoPointValue'])) return ['__ryycoType' => 'geopoint',
        'latitude' => (float)($value['geoPointValue']['latitude'] ?? 0), 'longitude' => (float)($value['geoPointValue']['longitude'] ?? 0)];
    foreach (['stringValue', 'booleanValue', 'referenceValue'] as $type) {
        if (array_key_exists($type, $value)) return $value[$type];
    }
    return null;
}

function storeDecodeFields(array $fields) {
    $result = [];
    foreach ($fields as $key => $value) $result[$key] = storeDecodeValue($value);
    // Un mapa vacío debe seguir siendo objeto en JSON, no lista.
    return $result ?: new stdClass();
}

function storeEquals(string $collection, string $field, string $value, int $limit = 0): array {
    $query = ['from' => [['collectionId' => $collection]],
        'where' => ['fieldFilter' => ['field' => ['fieldPath' => $field], 'op' => 'EQUAL', 'value' => ['stringValue' => $value]]]];
    if ($limit) $query['limit'] = $limit;
    return ['structuredQuery' => $query];
}

/** Varias consultas a Firestore al mismo tiempo. */
function storeParallel(array $requests): array {
    $multi = curl_multi_init();
    $handles = [];
    foreach ($requests as $key => [$url, $body]) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => true, CURLOPT_ENCODING => '', CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2]);
        if ($body !== null) curl_setopt_array($handle, [CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body)]);
        curl_multi_add_handle($multi, $handle);
        $handles[$key] = $handle;
    }
    try {
        do {
            $status = curl_multi_exec($multi, $running);
            if ($running) curl_multi_select($multi, 1.0);
        } while ($running && $status === CURLM_OK);
        $results = [];
        foreach ($handles as $key => $handle) {
            $code = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
            $text = curl_multi_getcontent($handle);
            // Un tema que no existe responde 404: es normal.
            if ($code === 404) { $results[$key] = null; continue; }
            if ($code !== 200 || !is_string($text)) throw new RuntimeException('Firestore unavailable');
            $results[$key] = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        }
        return $results;
    } finally {
        foreach ($handles as $handle) { curl_multi_remove_handle($multi, $handle); curl_close($handle); }
        curl_multi_close($multi);
    }
}

function storeRows(?array $rows): array {
    $docs = [];
    foreach ($rows ?? [] as $row) {
        if (isset($row['error'])) throw new RuntimeException('Firestore query failed');
        if (isset($row['document'])) $docs[] = $row['document'];
    }
    return $docs;
}

try {
    $raw = strtolower(trim((string)($_GET['username'] ?? '')));
    if (!preg_match('/^[a-z0-9._-]{1,60}$/D', $raw)) throw new InvalidArgumentException('username');
    $candidates = array_values(array_unique([$raw, str_replace(['-', '_'], '', $raw)]));

    $profileDoc = null;
    foreach ($candidates as $candidate) {
        $docs = storeRows(catalogHttpJson(STORE_BASE . ':runQuery', storeEquals('profiles', 'username', $candidate, 1)));
        if ($docs) { $profileDoc = $docs[0]; break; }
    }
    // No encontrado aquí: la app usa su búsqueda completa de siempre.
    if (!$profileDoc) { echo json_encode(['found' => false]); exit; }

    $uid = basename($profileDoc['name']);
    $related = storeParallel([
        'links' => [STORE_BASE . ':runQuery', storeEquals('links', 'userId', $uid)],
        'products' => [STORE_BASE . ':runQuery', storeEquals('products', 'userId', $uid)],
        'theme' => [STORE_BASE . '/themes/' . rawurlencode($uid), null],
    ]);

    $directory = __DIR__ . '/../catalog-images';
    $toItem = function (array $doc) use ($directory) {
        $item = (array)storeDecodeFields($doc['fields'] ?? []);
        return ['id' => basename($doc['name']), 'data' => catalogExternalize($item, $directory)];
    };
    $profile = $toItem($profileDoc);
    $theme = $related['theme'] && isset($related['theme']['fields'])
        ? catalogExternalize((array)storeDecodeFields($related['theme']['fields']), $directory) : null;

    echo json_encode([
        'found' => true,
        'username' => $raw,
        'profile' => $profile,
        'links' => array_map($toItem, storeRows($related['links'])),
        'products' => array_map($toItem, storeRows($related['products'])),
        'theme' => $theme,
        'confirmedAt' => gmdate('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException ? 400 : 503);
    echo json_encode(['error' => 'No se pudo cargar la tienda.']);
}

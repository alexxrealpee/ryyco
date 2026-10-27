<?php
require_once __DIR__ . '/catalog-live.php';
try {
    $kind = $_GET['kind'] ?? '';
    $id = (string)($_GET['id'] ?? '');
    $version = (string)($_GET['v'] ?? '');
    if (!in_array($kind,['stores','products'],true) || !preg_match('/^[A-Za-z0-9_.@ -]{1,150}$/D',$id) || strlen($version)>80) throw new InvalidArgumentException('image');
    $collection = $kind === 'stores' ? 'profiles' : 'products';
    $field = $kind === 'stores' ? 'photoURL' : 'imageURL';
    $key = hash('sha256', $kind . '/' . $id . '/' . $version);
    $directory = __DIR__ . '/../catalog-images';
    $cache = $directory . '/' . $key . '.json';
    $cached = is_file($cache) ? json_decode(file_get_contents($cache),true) : null;
    if ($cached && isset($cached['url'])) { header('Cache-Control: public, max-age=31536000, immutable'); header('Location: ' . $cached['url'], true, 302); exit; }
    $base = 'https://firestore.googleapis.com/v1/projects/studio-9002217802-13e05/databases/ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15/documents/';
    $doc = catalogHttpJson($base . $collection . '/' . rawurlencode($id) . '?mask.fieldPaths=' . $field);
    $original = $doc['fields'][$field]['stringValue'] ?? '';
    $url = catalogExternalize($original, $directory);
    $sameVersion = $version !== '' && ($doc['updateTime'] ?? '') === $version;
    if (preg_match('~^/(?!/)[^\r\n]*$~D',$url) || preg_match('~^https://[^\s\r\n]+$~D',$url)) {
        if ($sameVersion && is_dir($directory)) @file_put_contents($cache,json_encode(['url'=>$url]),LOCK_EX);
        header($sameVersion ? 'Cache-Control: public, max-age=31536000, immutable' : 'Cache-Control: no-store');
        header('Location: ' . $url,true,302); exit;
    }
    if (preg_match('~^data:image/(jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$~D',$original,$match)) {
        header('Content-Type: image/' . $match[1]);
        header($sameVersion ? 'Cache-Control: public, max-age=31536000, immutable' : 'Cache-Control: no-store');
        echo base64_decode($match[2],true); exit;
    }
    http_response_code(404);
} catch (Throwable $e) { http_response_code($e instanceof InvalidArgumentException ? 400 : 503); }
header('Cache-Control: no-store');

<?php
/**
 * Ryyco Geocoding Proxy Endpoint for Hostinger / Apache
 * 
 * Supports both forward geocoding (address -> coordinates) and
 * reverse geocoding (coordinates -> formatted address).
 * 
 * Automatically uses Google Maps Geocoding API if key is available,
 * with seamless fallback to Nominatim (OpenStreetMap).
 */

require_once __DIR__ . '/config.php';
ryyco_apply_cors();

header('Content-Type: application/json; charset=utf-8');

$lat = isset($_GET['lat']) ? trim($_GET['lat']) : null;
$lng = isset($_GET['lng']) ? trim($_GET['lng']) : null;
$address = isset($_GET['address']) ? trim($_GET['address']) : null;

$key = defined('RYYCO_GOOGLE_MAPS_API_KEY') ? trim(RYYCO_GOOGLE_MAPS_API_KEY) : '';

function make_http_get($url, $customHeaders = []) {
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        if (!empty($customHeaders)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $customHeaders);
        }
        $response = curl_exec($ch);
        curl_close($ch);
        return $response;
    } else {
        $options = [
            'http' => [
                'timeout' => 10,
                'header' => implode("\r\n", $customHeaders)
            ]
        ];
        $context = stream_context_create($options);
        return @file_get_contents($url, false, $context);
    }
}

// 1. Try Google Maps Geocoding if API key is configured
if (!empty($key)) {
    $googleUrl = '';
    if ($lat !== null && $lng !== null && is_numeric($lat) && is_numeric($lng)) {
        $googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?latlng={$lat},{$lng}&language=es&key={$key}";
    } elseif (!empty($address)) {
        $googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" . urlencode($address) . "&language=es&key={$key}";
    }

    if (!empty($googleUrl)) {
        $gRaw = make_http_get($googleUrl);
        if ($gRaw) {
            $gData = json_decode($gRaw, true);
            if (isset($gData['status']) && $gData['status'] === 'OK' && !empty($gData['results'])) {
                $first = $gData['results'][0];
                echo json_encode([
                    'status' => 'OK',
                    'formatted_address' => $first['formatted_address'] ?? '',
                    'lat' => $first['geometry']['location']['lat'] ?? floatval($lat),
                    'lng' => $first['geometry']['location']['lng'] ?? floatval($lng),
                    'source' => 'google'
                ]);
                exit;
            }
        }
    }
}

// 2. High-speed Photon Geocoding fallback (< 300ms)
if ($lat !== null && $lng !== null && is_numeric($lat) && is_numeric($lng)) {
    $pUrl = "https://photon.komoot.io/reverse?lat={$lat}&lon={$lng}";
    $pRaw = make_http_get($pUrl);
    if ($pRaw) {
        $pData = json_decode($pRaw, true);
        if (!empty($pData['features']) && isset($pData['features'][0]['properties'])) {
            $p = $pData['features'][0]['properties'];
            $street = !empty($p['street']) ? (!empty($p['housenumber']) ? "{$p['street']} #{$p['housenumber']}" : $p['street']) : '';
            $parts = array_filter([
                (!empty($p['name']) && $p['name'] !== (!empty($p['street']) ? $p['street'] : '')) ? $p['name'] : null,
                $street ?: null,
                $p['locality'] ?? ($p['district'] ?? ($p['suburb'] ?? null)),
                $p['city'] ?? ($p['county'] ?? null),
                $p['state'] ?? null
            ]);
            $formatted = implode(', ', $parts);
            if (!empty($formatted)) {
                echo json_encode([
                    'status' => 'OK',
                    'formatted_address' => $formatted,
                    'lat' => floatval($lat),
                    'lng' => floatval($lng),
                    'source' => 'photon'
                ]);
                exit;
            }
        }
    }
} elseif (!empty($address)) {
    $pUrl = "https://photon.komoot.io/api/?q=" . urlencode($address) . "&limit=1";
    $pRaw = make_http_get($pUrl);
    if ($pRaw) {
        $pData = json_decode($pRaw, true);
        if (!empty($pData['features']) && isset($pData['features'][0]['properties'])) {
            $f = $pData['features'][0];
            $p = $f['properties'];
            $coords = $f['geometry']['coordinates'] ?? null;
            $street = !empty($p['street']) ? (!empty($p['housenumber']) ? "{$p['street']} #{$p['housenumber']}" : $p['street']) : '';
            $parts = array_filter([
                (!empty($p['name']) && $p['name'] !== (!empty($p['street']) ? $p['street'] : '')) ? $p['name'] : null,
                $street ?: null,
                $p['locality'] ?? ($p['district'] ?? ($p['suburb'] ?? null)),
                $p['city'] ?? ($p['county'] ?? null),
                $p['state'] ?? null
            ]);
            echo json_encode([
                'status' => 'OK',
                'formatted_address' => !empty($parts) ? implode(', ', $parts) : $address,
                'lat' => $coords ? floatval($coords[1]) : 0,
                'lng' => $coords ? floatval($coords[0]) : 0,
                'source' => 'photon'
            ]);
            exit;
        }
    }
}

// 3. Fallback to OpenStreetMap Nominatim
$headers = [
    'User-Agent: RyycoStore/1.0 (contact@ryyco.com)',
    'Accept-Language: es'
];

if ($lat !== null && $lng !== null && is_numeric($lat) && is_numeric($lng)) {
    $nomUrl = "https://nominatim.openstreetmap.org/reverse?format=json&lat={$lat}&lon={$lng}&zoom=18&addressdetails=1";
    $nomRaw = make_http_get($nomUrl, $headers);
    if ($nomRaw) {
        $nomData = json_decode($nomRaw, true);
        if (isset($nomData['display_name'])) {
            echo json_encode([
                'status' => 'OK',
                'formatted_address' => $nomData['display_name'],
                'lat' => floatval($lat),
                'lng' => floatval($lng),
                'source' => 'fallback'
            ]);
            exit;
        }
    }

    // Ultimate fallback if Nominatim is unreachable
    echo json_encode([
        'status' => 'OK',
        'formatted_address' => "Ubicación GPS (" . round(floatval($lat), 5) . ", " . round(floatval($lng), 5) . ")",
        'lat' => floatval($lat),
        'lng' => floatval($lng),
        'source' => 'coords'
    ]);
    exit;
} elseif (!empty($address)) {
    $nomUrl = "https://nominatim.openstreetmap.org/search?format=json&q=" . urlencode($address) . "&limit=1";
    $nomRaw = make_http_get($nomUrl, $headers);
    if ($nomRaw) {
        $nomData = json_decode($nomRaw, true);
        if (is_array($nomData) && !empty($nomData) && isset($nomData[0])) {
            echo json_encode([
                'status' => 'OK',
                'formatted_address' => $nomData[0]['display_name'] ?? $address,
                'lat' => floatval($nomData[0]['lat']),
                'lng' => floatval($nomData[0]['lon']),
                'source' => 'fallback'
            ]);
            exit;
        }
    }
}

// If no results could be found
echo json_encode([
    'status' => 'ZERO_RESULTS',
    'formatted_address' => $address ?: '',
    'lat' => $lat !== null ? floatval($lat) : null,
    'lng' => $lng !== null ? floatval($lng) : null,
    'source' => 'none'
]);

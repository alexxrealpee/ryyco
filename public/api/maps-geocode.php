<?php
/**
 * RYYCO Google Maps Geocoding & Reverse Geocoding Proxy for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$mapsKey = getApiKey('VITE_GOOGLE_MAPS_API_KEY') ?: getApiKey('GOOGLE_MAPS_API_KEY') ?: '';

$lat = isset($_GET['lat']) ? floatval($_GET['lat']) : null;
$lng = isset($_GET['lng']) ? floatval($_GET['lng']) : null;
$address = isset($_GET['address']) ? trim($_GET['address']) : '';

// 1. If Google Maps API key is configured, use Google Geocoding API
if (!empty($mapsKey)) {
    if ($lat !== null && $lng !== null) {
        $googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?latlng={$lat},{$lng}&key=" . urlencode($mapsKey) . "&language=es";
    } elseif (!empty($address)) {
        $googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" . urlencode($address) . "&key=" . urlencode($mapsKey) . "&language=es";
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Falta parámetro lat/lng o address.']);
        exit(0);
    }

    $ch = curl_init($googleUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HTTPHEADER => ['Accept: application/json']
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status === 200 && !empty($raw)) {
        echo $raw;
        exit(0);
    }
}

// 2. OpenStreetMap / Photon fallback if Google Maps API key is not set or failed
if ($lat !== null && $lng !== null) {
    $osmUrl = "https://nominatim.openstreetmap.org/reverse?format=json&lat={$lat}&lon={$lng}&zoom=18&addressdetails=1";
    $ch = curl_init($osmUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HTTPHEADER => [
            'User-Agent: Ryyco-App/1.0',
            'Accept: application/json'
        ]
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);

    if (!empty($raw)) {
        $osmData = json_decode($raw, true);
        if ($osmData && !empty($osmData['display_name'])) {
            echo json_encode([
                'status' => 'OK',
                'results' => [
                    [
                        'formatted_address' => $osmData['display_name'],
                        'geometry' => [
                            'location' => [
                                'lat' => $lat,
                                'lng' => $lng
                            ]
                        ]
                    ]
                ]
            ], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
    }
}

echo json_encode([
    'status' => 'ZERO_RESULTS',
    'results' => []
]);

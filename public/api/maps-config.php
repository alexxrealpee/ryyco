<?php
/**
 * RYYCO Google Maps Platform Configuration for Hostinger
 * SPDX-License-Identifier: Apache-2.0
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$mapsKey = getApiKey('VITE_GOOGLE_MAPS_API_KEY') ?: getApiKey('GOOGLE_MAPS_API_KEY') ?: '';

echo json_encode([
    'apiKey' => $mapsKey,
    'configured' => !empty($mapsKey)
]);

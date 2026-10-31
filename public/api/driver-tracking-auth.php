<?php
// Hostinger/PHP bridge. Private service-account JSON must remain outside public_html.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

function gpsReply(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function gpsBase64(string $value): string {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}
function gpsDecode(string $value): string {
    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    if ($decoded === false) throw new RuntimeException('invalid-token');
    return $decoded;
}
function gpsHttp(string $url, ?array $body = null, array $headers = [], bool $form = false): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $form ? http_build_query($body) : json_encode($body, JSON_THROW_ON_ERROR));
        $headers[] = 'Content-Type: ' . ($form ? 'application/x-www-form-urlencoded' : 'application/json');
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($raw === false || $status < 200 || $status >= 300) throw new RuntimeException('upstream-unavailable');
    return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
}
function gpsCredentials(string $project): array {
    $json = getenv('FIREBASE_SERVICE_ACCOUNT_JSON');
    $envCreds = getenv('GOOGLE_APPLICATION_CREDENTIALS');
    if (!$json && is_string($envCreds) && str_starts_with(ltrim($envCreds), '{')) {
        $json = $envCreds;
    }
    if (!$json) {
        $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__));
        $candidate = $envCreds ?: dirname($root ?: dirname(__DIR__)) . '/firebase-service-account.json';
        $path = realpath($candidate);
        // Never accept an exposed credential file, including symlinks into public_html.
        if (!$path || !$root || str_starts_with(strtolower($path), strtolower($root . DIRECTORY_SEPARATOR))) {
            throw new RuntimeException('credentials-missing');
        }
        $json = file_get_contents($path);
    }
    $account = json_decode($json ?: '', true, 32, JSON_THROW_ON_ERROR);
    if (($account['type'] ?? '') !== 'service_account' || ($account['project_id'] ?? '') !== $project ||
        empty($account['client_email']) || empty($account['private_key'])) throw new RuntimeException('credentials-missing');
    return $account;
}
function gpsSign(array $payload, array $account): string {
    $unsigned = gpsBase64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR)) . '.' .
        gpsBase64(json_encode($payload, JSON_THROW_ON_ERROR));
    if (!openssl_sign($unsigned, $signature, $account['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('signing-unavailable');
    }
    return $unsigned . '.' . gpsBase64($signature);
}
function gpsVerify(string $token, string $project): array {
    $parts = explode('.', $token);
    if (count($parts) !== 3 || strlen($token) > 16384) throw new RuntimeException('invalid-token');
    $header = json_decode(gpsDecode($parts[0]), true, 16, JSON_THROW_ON_ERROR);
    $claims = json_decode(gpsDecode($parts[1]), true, 32, JSON_THROW_ON_ERROR);
    if (($header['alg'] ?? '') !== 'RS256' || !is_string($header['kid'] ?? null)) throw new RuntimeException('invalid-token');
    $certs = gpsHttp('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    $cert = $certs[$header['kid']] ?? null;
    if (!$cert || openssl_verify($parts[0] . '.' . $parts[1], gpsDecode($parts[2]), $cert, OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('invalid-token');
    }
    $now = time();
    if (($claims['aud'] ?? '') !== $project || ($claims['iss'] ?? '') !== 'https://securetoken.google.com/' . $project ||
        !is_numeric($claims['exp'] ?? null) || $claims['exp'] <= $now || ($claims['iat'] ?? PHP_INT_MAX) > $now ||
        ($claims['auth_time'] ?? PHP_INT_MAX) > $now || !is_string($claims['sub'] ?? null) ||
        strlen($claims['sub']) < 1 || strlen($claims['sub']) > 128) throw new RuntimeException('invalid-token');
    return $claims;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
$project = getenv('FIREBASE_PROJECT_ID') ?: 'studio-9002217802-13e05';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $configured = false;
        try { gpsCredentials($project); $configured = extension_loaded('curl') && extension_loaded('openssl'); } catch (Throwable $e) {}
        gpsReply(200, ['service' => 'driver-tracking-auth', 'platform' => 'PHP', 'configured' => $configured]);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') gpsReply(405, ['error' => 'Método no permitido.']);
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer (\S+)$/', $authorization, $match)) gpsReply(401, ['error' => 'Verifica tu cuenta con Google.']);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 4096) gpsReply(413, ['error' => 'Solicitud demasiado grande.']);
    $input = json_decode(file_get_contents('php://input', false, null, 0, 4097), true, 16, JSON_THROW_ON_ERROR);
    $identity = gpsVerify($match[1], $project);
    if (($identity['email_verified'] ?? false) !== true || empty($identity['email']) ||
        ($identity['firebase']['sign_in_provider'] ?? '') !== 'google.com') {
        gpsReply(403, ['error' => 'Usa Google con el correo registrado como domiciliario.']);
    }
    $email = strtolower(trim($identity['email']));
    $driverId = 'driver_' . preg_replace('/[^a-z0-9]/', '_', $email);
    if (($input['driverId'] ?? '') !== $driverId || strlen($driverId) > 128) {
        gpsReply(403, ['error' => 'La cuenta de Google no corresponde a este domiciliario.']);
    }
    $account = gpsCredentials($project);
    $now = time();
    $oauthJwt = gpsSign(['iss' => $account['client_email'], 'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 300], $account);
    $oauth = gpsHttp('https://oauth2.googleapis.com/token',
        ['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $oauthJwt], [], true);
    if (empty($oauth['access_token'])) throw new RuntimeException('upstream-unavailable');
    $database = getenv('FIRESTORE_DATABASE_ID') ?: 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
    $driver = gpsHttp('https://firestore.googleapis.com/v1/projects/' . rawurlencode($project) . '/databases/' .
        rawurlencode($database) . '/documents/drivers/' . rawurlencode($driverId), null, ['Authorization: Bearer ' . $oauth['access_token']]);
    $fields = $driver['fields'] ?? [];
    if (strtolower(trim($fields['email']['stringValue'] ?? '')) !== $email || ($fields['status']['stringValue'] ?? '') !== 'approved') {
        gpsReply(403, ['error' => 'Se requiere un domiciliario aprobado con ese correo.']);
    }
    $token = gpsSign(['iss' => $account['client_email'], 'sub' => $account['client_email'],
        'aud' => 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        'iat' => $now, 'exp' => $now + 300, 'uid' => $driverId], $account);
    gpsReply(200, ['token' => $token]);
} catch (Throwable $e) {
    $reason = $e->getMessage();
    if ($reason === 'invalid-token') gpsReply(401, ['error' => 'La sesión no es válida o expiró. Verifica nuevamente tu cuenta con Google.']);
    if ($e instanceof JsonException) gpsReply(400, ['error' => 'Solicitud o configuración inválida.']);
    gpsReply(503, ['error' => $reason === 'credentials-missing'
        ? 'Falta configurar la cuenta de servicio de Firebase fuera de public_html.'
        : 'No se pudo verificar la cuenta. Revisa la conexión del servidor con Firebase y los permisos de la cuenta de servicio.']);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const php = process.env.PHP_BINARY || 'php';
const phpArgs = process.env.PHP_EXTENSION_DIR ? ['-d', `extension_dir=${process.env.PHP_EXTENSION_DIR}`, '-d', 'extension=openssl'] : [];
const source = fs.readFileSync('public/api/driver-tracking-auth.php', 'utf8');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ryyco-gps-test-'));
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const project = 'studio-9002217802-13e05';
const now = Math.floor(Date.now() / 1000);
const payload = { aud: project, iss: `https://securetoken.google.com/${project}`, sub: 'verified-user',
  iat: now - 60, auth_time: now - 60, exp: now + 3600, email: 'driver@example.com', email_verified: true,
  firebase: { sign_in_provider: 'google.com' } };
function token(changes = {}) {
  const input = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ ...payload, ...changes })).toString('base64url');
  return input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}
function phpString(value) { return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function execute(code) {
  const file = path.join(temporary, 'test.php');
  fs.writeFileSync(file, code);
  const result = spawnSync(php, [...phpArgs, file], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert(!result.stderr, result.stderr);
  return result.stdout;
}
try {
  // Mock only the HTTPS certificate fetch; exercise real RSA signature and claim checks.
  let helpers = source.slice(0, source.indexOf("if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS')"));
  helpers = helpers.replace(/function gpsHttp[\s\S]*?(?=function gpsCredentials)/,
    `function gpsHttp(string $url, ?array $body = null, array $headers = [], bool $form = false): array { return ['test' => ${phpString(publicKey)}]; }\n`);
  let tests = `\nfunction expectFailure($callback) { try { $callback(); } catch (Throwable $e) { return; } throw new RuntimeException('Unexpected acceptance'); }\n`;
  tests += `gpsVerify(${phpString(token())}, '${project}');\n`;
  for (const changes of [{ exp: now - 100 }, { aud: 'wrong-project' }, { iss: 'wrong-issuer' }, { iat: now + 3600 }, { sub: '' }]) {
    tests += `expectFailure(fn() => gpsVerify(${phpString(token(changes))}, '${project}'));\n`;
  }
  const valid = token();
  const parts = valid.split('.');
  parts[1] = Buffer.from(JSON.stringify({ ...payload, email: 'attacker@example.com' })).toString('base64url');
  tests += `expectFailure(fn() => gpsVerify(${phpString(parts.join('.'))}, '${project}'));\n`;
  tests += `$account = ['client_email' => 'test@example.com', 'private_key' => ${phpString(privateKey)}];\n`;
  tests += `$signed = gpsSign(['uid' => 'driver_example'], $account); $parts = explode('.', $signed);\n`;
  tests += `if (openssl_verify($parts[0].'.'.$parts[1], gpsDecode($parts[2]), ${phpString(publicKey)}, OPENSSL_ALGO_SHA256) !== 1) throw new RuntimeException('Bad signature');\n`;
  tests += `echo 'PASS PHP: real RSA signatures, tampering, expiry, project, issuer, subject and signing.';`;
  console.log(execute(helpers + tests));
  const endpoint = path.resolve('public/api/driver-tracking-auth.php');
  const get = JSON.parse(execute(`<?php $_SERVER['REQUEST_METHOD']='GET'; $_SERVER['DOCUMENT_ROOT']=${phpString(temporary)}; require ${phpString(endpoint)};`));
  assert.equal(get.platform, 'PHP');
  assert.equal(get.configured, false);
  const missing = JSON.parse(execute(`<?php $_SERVER['REQUEST_METHOD']='POST'; require ${phpString(endpoint)};`));
  assert.match(missing.error, /Google/);
  assert.match(fs.readFileSync('public/.htaccess', 'utf8'), /tracking-auth.*api\/driver-tracking-auth\.php/);
  console.log('PASS PHP: installation diagnostics, missing authentication and Apache routing.');
  const root = path.join(temporary, 'public_html');
  fs.mkdirSync(root);
  const credentials = path.join(temporary, 'firebase-service-account.json');
  fs.writeFileSync(credentials, JSON.stringify({ type: 'service_account', project_id: project,
    client_email: 'fixture@example.com', private_key: privateKey }));
  const driverId = 'driver_driver_example_com';
  function request(idToken, requestedId = driverId, approval = 'approved', credentialPath = credentials) {
    let endpointSource = source.replace(/function gpsHttp[\s\S]*?(?=function gpsCredentials)/,
      `function gpsHttp(string $url, ?array $body = null, array $headers = [], bool $form = false): array {
        if (str_contains($url, 'metadata/x509')) return ['test' => ${phpString(publicKey)}];
        if ($url === 'https://oauth2.googleapis.com/token') return ['access_token' => 'fixture'];
        return ['fields' => ['email' => ['stringValue' => 'driver@example.com'], 'status' => ['stringValue' => '${approval}']]];
      }\n`);
    endpointSource = endpointSource.replace("file_get_contents('php://input', false, null, 0, 4097)", phpString(JSON.stringify({ driverId: requestedId })));
    const setup = `$_SERVER['REQUEST_METHOD']='POST'; $_SERVER['DOCUMENT_ROOT']=${phpString(root)};
      $_SERVER['HTTP_AUTHORIZATION']=${phpString('Bearer ' + idToken)};
      putenv(${phpString('GOOGLE_APPLICATION_CREDENTIALS=' + credentialPath)}); putenv('FIREBASE_SERVICE_ACCOUNT_JSON');`;
    endpointSource = endpointSource.replace('declare(strict_types=1);', 'declare(strict_types=1);\n' + setup);
    return JSON.parse(execute(endpointSource));
  }
  assert.match(request(token({ email_verified: false })).error, /Google/);
  assert.match(request(token({ firebase: { sign_in_provider: 'password' } })).error, /Google/);
  assert.match(request(token(), 'another-driver').error, /corresponde/);
  assert.match(request(token(), driverId, 'pending').error, /aprobado/);
  const exposed = path.join(root, 'credentials.json');
  fs.copyFileSync(credentials, exposed);
  assert.match(request(token(), driverId, 'approved', exposed).error, /fuera de public_html/);
  const authenticated = request(token());
  const issuedParts = authenticated.token.split('.');
  const issuedPayload = JSON.parse(Buffer.from(issuedParts[1], 'base64url'));
  assert.equal(issuedPayload.uid, driverId);
  assert.equal(issuedPayload.exp - issuedPayload.iat, 300);
  assert(crypto.verify('RSA-SHA256', Buffer.from(issuedParts.slice(0, 2).join('.')), publicKey, Buffer.from(issuedParts[2], 'base64url')));
  console.log('PASS PHP endpoint: matching verified Google driver, approval, private credentials and signed session.');
} finally {
  // Remove only this newly created test directory.
  fs.rmSync(temporary, { recursive: true, force: true });
}

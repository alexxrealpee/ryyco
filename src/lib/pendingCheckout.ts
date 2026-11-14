const key = 'ryyco_pending_checkout_orders';
type Attempt = { id: string; seller: string; at: number };
let memory: Record<string, Attempt> = {};
function read() {
  try { memory = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch {}
  return memory;
}
function write() { try { sessionStorage.setItem(key, JSON.stringify(memory)); } catch {} }
export function pendingCheckoutId(fingerprint: string, seller: string, createId: () => string) {
  const attempts = read();
  if (attempts[fingerprint]) return attempts[fingerprint].id;
  const id = createId();
  attempts[fingerprint] = { id, seller, at: Date.now() };
  write();
  return id;
}
export function finishCheckoutAttempt(seller: string) {
  const attempts = read();
  for (const [fingerprint, attempt] of Object.entries(attempts)) if (attempt.seller === seller) delete attempts[fingerprint];
  write();
}

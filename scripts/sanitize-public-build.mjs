import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../dist/', import.meta.url));
let removed = 0;
async function sanitize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relative = path.relative(output, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output path escaped dist');
    // Do not follow links copied into a public build.
    if (entry.isSymbolicLink()) { await unlink(target); removed++; continue; }
    if (entry.isDirectory()) { await sanitize(target); continue; }
    if (/^(?:keys(?:\.local)?\.php|apis(?:\.php)?|\.env(?:\..*)?|firebase-service-account.*\.json)$/i.test(entry.name)) {
      await unlink(target);
      removed++;
    }
  }
}
await sanitize(output);
console.log(`Public build sanitized: ${removed} private configuration files excluded (originals preserved).`);

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Keep image bytes out of JSON so the browser can download only visible images.
export function externalizeCatalogImages(catalog, directories) {
  const extensions = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif' };
  function visit(value) {
    if (typeof value === 'string') {
      const match = /^data:image\/(jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
      if (!match) return value;
      const bytes = Buffer.from(match[2], 'base64');
      const name = `${createHash('sha256').update(bytes).digest('hex')}.${extensions[match[1]]}`;
      for (const directory of directories) {
        const folder = path.join(directory, 'catalog-images');
        mkdirSync(folder, { recursive: true });
        const file = path.join(folder, name);
        if (!existsSync(file)) writeFileSync(file, bytes);
      }
      return `/catalog-images/${name}`;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    }
    return value;
  }
  return visit(catalog);
}

export function writeCatalogCaches(catalog, directories) {
  for (const directory of directories) {
    writeFileSync(path.join(directory, 'catalog-cache.json'), JSON.stringify({ success: true, catalog, isPartial: false }));
    writeFileSync(path.join(directory, 'catalog-initial.json'), JSON.stringify({
      success: true,
      catalog: { ...catalog, products: catalog.products.slice(0, 6) },
      isPartial: catalog.products.length > 6
    }));
  }
}

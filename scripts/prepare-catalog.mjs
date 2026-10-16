import { readFileSync } from 'node:fs';
import { externalizeCatalogImages, writeCatalogCaches } from '../server/catalogAssets.mjs';

const directory = new URL('../public/', import.meta.url);
const { fileURLToPath } = await import('node:url');
const publicPath = fileURLToPath(directory);
const data = JSON.parse(readFileSync(new URL('catalog-cache.json', directory), 'utf8'));
if (!data.catalog || !Array.isArray(data.catalog.products)) throw new Error('Invalid catalog cache');
const catalog = externalizeCatalogImages(data.catalog, [publicPath]);
writeCatalogCaches(catalog, [publicPath]);
console.log(`Catalog prepared: ${catalog.products.length} products; images served separately.`);

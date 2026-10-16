import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { externalizeCatalogImages, writeCatalogCaches } from '../server/catalogAssets.mjs';

test('image extraction preserves exact bytes, product fields, and remote URLs', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ryyco-catalog-'));
  try {
    const bytes = Buffer.from('image fixture');
    const original = { stores: [], products: Array.from({ length: 8 }, (_, id) => ({
      id: String(id), price: 1000, addons: [{ id: 'extra', price: 500 }],
      imageURL: `data:image/png;base64,${bytes.toString('base64')}`,
      thumbnail: 'https://example.com/image.webp'
    })) };
    const optimized = externalizeCatalogImages(original, [directory]);
    const product = optimized.products[0];
    assert.deepEqual(readFileSync(path.join(directory, product.imageURL)), bytes);
    assert.equal(product.thumbnail, original.products[0].thumbnail);
    assert.deepEqual(product.addons, original.products[0].addons);
    assert.equal(product.price, 1000);
    assert.match(original.products[0].imageURL, /^data:/);
    assert.deepEqual(externalizeCatalogImages(optimized, [directory]), optimized);
    writeCatalogCaches(optimized, [directory]);
    const initial = JSON.parse(readFileSync(path.join(directory, 'catalog-initial.json')));
    const full = JSON.parse(readFileSync(path.join(directory, 'catalog-cache.json')));
    assert.equal(initial.catalog.products.length, 6);
    assert.equal(initial.isPartial, true);
    assert.equal(full.catalog.products.length, 8);
    assert.equal(full.isPartial, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('published catalog references existing images and initial payload stays small', () => {
  const publicRoot = new URL('../public/', import.meta.url);
  const initial = readFileSync(new URL('catalog-initial.json', publicRoot));
  assert.ok(initial.length < 100_000);
  const full = JSON.parse(readFileSync(new URL('catalog-cache.json', publicRoot)));
  function check(value) {
    if (typeof value === 'string' && value.startsWith('/catalog-images/')) {
      assert.ok(existsSync(new URL(value.slice(1), publicRoot)), value);
    } else if (value && typeof value === 'object') Object.values(value).forEach(check);
  }
  check(full);
  assert.equal(JSON.parse(initial).catalog.products.length, Math.min(6, full.catalog.products.length));
});

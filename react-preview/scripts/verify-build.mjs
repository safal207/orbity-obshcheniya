import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const build = new URL('../build/', import.meta.url);
const linkedAssets = [];
for (const [entry, language] of [['index.html', 'ru'], ['en.html', 'en']]) {
  const html = readFileSync(new URL(entry, build), 'utf8');
  assert.match(html, new RegExp(`<html lang="${language}">`), `${entry} has its public language`);
  assert.doesNotMatch(html, /noindex|React preview/i, `${entry} is public production metadata`);
  const alternates = [...html.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/g)].map(([link]) => ({
    language: link.match(/\bhreflang="([^"]+)"/)?.[1],
    href: link.match(/\bhref="([^"]+)"/)?.[1],
  }));
  assert.deepEqual(alternates, [
    { language: 'ru', href: 'https://safal207.github.io/orbity-obshcheniya/' },
    { language: 'en', href: 'https://safal207.github.io/orbity-obshcheniya/en.html' },
    { language: 'x-default', href: 'https://safal207.github.io/orbity-obshcheniya/' },
  ], `${entry} language alternates point to working public entry points`);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref="[^"]*\/assets\/[^"?#]*\.html["?#]/i, `${entry} never links an unbundled HTML asset`);
  assert.match(html, /<meta name="theme-color" content="#f6f4fc"\s*\/?>/, `${entry} uses the Lumi background color`);
  assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large"\s*\/?>/, `${entry} permits indexing and large previews`);
  assert.match(html, /<meta property="og:image" content="https:\/\/safal207\.github\.io\/orbity-obshcheniya\/orbity-og-lumi-v2\.png"\s*\/?>/, `${entry} exposes the versioned Lumi share card`);
  assert.match(html, /<meta property="og:image:width" content="1200"\s*\/?>/, `${entry} declares share-card width`);
  assert.match(html, /<meta property="og:image:height" content="630"\s*\/?>/, `${entry} declares share-card height`);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"\s*\/?>/, `${entry} uses a large Twitter/X card`);
  assert.match(html, /<script type="application\/ld\+json">[\s\S]*"EducationalApplication"[\s\S]*<\/script>/, `${entry} includes structured application data`);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1, `${entry} loads one shared application`);
  for (const asset of [...scripts, ...[...html.matchAll(/<link\b[^>]*\bhref="(\.\/assets\/[^"]+)"/g)].map((match) => match[1])]) {
    assert.match(asset, /^\.\/assets\//, `${entry} assets work at the Pages repository subpath`);
    assert.ok(readFileSync(new URL(asset, build)).length > 0, `${entry} asset ${asset} exists`);
  }
  linkedAssets.push(scripts[0]);
}
assert.equal(linkedAssets[0], linkedAssets[1], 'RU and EN use the exact same tested application');
const assets = readdirSync(new URL('assets/', build));
assert.ok(assets.some((file) => /^lumi-portraits-.*\.webp$/.test(file)), 'the public site contains Lumi artwork');
assert.ok(!assets.some((file) => /\.html$/i.test(file)), 'HTML entries are bundled at the site root, never copied as raw assets');
assert.ok(readFileSync(new URL('orbity-og.png', build)).length > 20000, 'the old raster share card stays available for existing references');
assert.ok(readFileSync(new URL('orbity-og-lumi-v2.png', build)).length > 20000, 'the public site contains the versioned Lumi share card');
assert.ok(readFileSync(new URL('orbity-icon.png', build)).length > 10000, 'the public site contains a Lumi app icon');
const share = readFileSync(new URL('share.html', build), 'utf8');
assert.match(share, /<meta property="og:url" content="https:\/\/safal207\.github\.io\/orbity-obshcheniya\/share\.html"\s*\/?>/, 'the fresh share URL has its own Open Graph cache key');
assert.match(share, /orbity-og-lumi-v2\.png/, 'the fresh share URL uses the versioned Lumi image');
assert.match(share, /location\.replace\('\.\/'\)/, 'the fresh share URL returns people to the app');
assert.match(readFileSync(new URL('robots.txt', build), 'utf8'), /Sitemap: https:\/\/safal207\.github\.io\/orbity-obshcheniya\/sitemap\.xml/, 'robots points to the public sitemap');
assert.match(readFileSync(new URL('sitemap.xml', build), 'utf8'), /orbity-obshcheniya\/en\.html/, 'sitemap contains the English entry');
const manifest = JSON.parse(readFileSync(new URL('site.webmanifest', build), 'utf8'));
assert.equal(manifest.icons?.[0]?.src, './orbity-icon.png', 'manifest uses the generated Lumi icon');
console.log('Production build: RU/EN entries, versioned share metadata, fresh share URL, sitemap, social assets, shared app and Lumi verified.');

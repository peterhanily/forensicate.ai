// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { routeShells } from '../build/routeShells';
import { routePaths } from '../src/routePaths';

it('builds root-relative entry shells for every known route without redirects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forensicate-route-shells-'));
  try {
    await writeFile(join(root, 'index.html'), '<!doctype html><html><head><link rel="canonical" href="https://forensicate.ai/" /></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>');
    await writeFile(join(root, 'main.js'), 'document.getElementById("root").textContent = "Benign route fixture";');
    const result = await build({ root, configFile: false, base: '/', plugins: [routeShells()], logLevel: 'silent', build: { write: false } });
    if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one build output');
    const htmlEntries = result.output.filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.html'));
    expect(htmlEntries).toHaveLength(Object.keys(routePaths).length + 1);
    for (const route of Object.values(routePaths)) {
      const entry = htmlEntries.find(asset => asset.fileName === `${route}/index.html`);
      expect(entry).toBeDefined();
      if (!entry || entry.type !== 'asset') throw new Error('Missing route shell');
      const source = String(entry.source);
      expect(source).toContain(`href="https://forensicate.ai/${route}/"`);
      expect(source).toMatch(/src="\/assets\//);
      expect(source).not.toMatch(/location\.(?:replace|href)|http-equiv="refresh"/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('lists the home page, every route shell, and the offline file in the sitemap', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  expect(locations.sort()).toEqual([
    'https://forensicate.ai/',
    'https://forensicate.ai/forensicate-standalone.html',
    ...Object.values(routePaths).map(route => `https://forensicate.ai/${route}/`),
  ].sort());
});

#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const browser = process.env.BROWSER || 'chrome';
const outdir = join(rootDir, 'dist', browser);

console.log(`Building extension for ${browser}...`);

// Create output directory
mkdirSync(join(outdir, 'assets'), { recursive: true });
mkdirSync(join(outdir, 'pages'), { recursive: true });

// Bundle background script (includes scanner)
console.log('Bundling background.js with scanner...');
const isDev = process.env.NODE_ENV === 'development';

await esbuild.build({
  entryPoints: [join(rootDir, 'src/background.js')],
  bundle: true,
  format: 'esm',
  outfile: join(outdir, 'background.js'),
  platform: 'browser',
  target: 'chrome96',
  minify: !isDev, // Minify in production
  minifyWhitespace: !isDev,
  minifyIdentifiers: !isDev,
  minifySyntax: !isDev,
  treeShaking: true, // Remove unused code
  sourcemap: isDev, // Only in dev
  external: [], // Bundle everything
  legalComments: 'none', // Remove comments
  drop: isDev ? [] : ['console', 'debugger'], // Remove console.log in production
  logLevel: 'info',
});

console.log('✓ Background script bundled');

// Get bundle size
const bundlePath = join(outdir, 'background.js');
const bundleSize = (await import('fs')).statSync(bundlePath).size;
const bundleSizeKB = (bundleSize / 1024).toFixed(2);
const bundleSizeMB = (bundleSize / (1024 * 1024)).toFixed(2);
console.log(`  Size: ${bundleSizeKB} KB (${bundleSizeMB} MB)`);

// Copy static files
console.log('Copying static files...');

// Manifest
copyFileSync(
  join(rootDir, 'src/manifest.json'),
  join(outdir, 'manifest.json')
);

// Popup
copyFileSync(
  join(rootDir, 'src/popup.html'),
  join(outdir, 'popup.html')
);
copyFileSync(
  join(rootDir, 'src/popup.js'),
  join(outdir, 'popup.js')
);

// Result page
copyFileSync(
  join(rootDir, 'pages/result.html'),
  join(outdir, 'pages/result.html')
);
copyFileSync(
  join(rootDir, 'pages/result.js'),
  join(outdir, 'pages/result.js')
);

// Library page
copyFileSync(
  join(rootDir, 'pages/library.html'),
  join(outdir, 'pages/library.html')
);
copyFileSync(
  join(rootDir, 'pages/library.js'),
  join(outdir, 'pages/library.js')
);

// History page
copyFileSync(
  join(rootDir, 'pages/history.html'),
  join(outdir, 'pages/history.html')
);
copyFileSync(
  join(rootDir, 'pages/history.js'),
  join(outdir, 'pages/history.js')
);

// Copy icon files
console.log('Copying icon files...');
const iconSizes = [16, 48, 128];
iconSizes.forEach(size => {
  const iconFile = `icon-${size}.png`;
  const sourcePath = join(rootDir, 'assets', iconFile);
  const destPath = join(outdir, 'assets', iconFile);

  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, destPath);
  } else {
    console.warn(`Warning: ${iconFile} not found. Run 'npm run generate:icons' first.`);
  }
});

// Copy SVG as well
const svgSource = join(rootDir, 'assets/icon.svg');
if (existsSync(svgSource)) {
  copyFileSync(svgSource, join(outdir, 'assets/icon.svg'));
}

console.log('✓ Static files copied');

// Browser-specific adjustments
if (browser === 'firefox') {
  console.log('Applying Firefox-specific changes...');
  const manifest = JSON.parse(readFileSync(join(outdir, 'manifest.json'), 'utf8'));

  // Firefox uses 'browser_specific_settings' instead of 'action'
  manifest.browser_specific_settings = {
    gecko: {
      id: 'forensicate@forensicate.ai',
      strict_min_version: '96.0'
    }
  };

  writeFileSync(
    join(outdir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('✓ Firefox manifest updated');
}

console.log(`\n✅ Extension built successfully for ${browser}!`);
console.log(`Output: ${outdir}`);
console.log('\nTo load in browser:');
if (browser === 'chrome') {
  console.log('1. Go to chrome://extensions');
  console.log('2. Enable "Developer mode"');
  console.log('3. Click "Load unpacked"');
  console.log(`4. Select: ${outdir}`);
} else {
  console.log('1. Go to about:debugging#/runtime/this-firefox');
  console.log('2. Click "Load Temporary Add-on"');
  console.log(`3. Select: ${join(outdir, 'manifest.json')}`);
}

console.log('\n📦 To create zip for store:');
console.log(`   npm run package:${browser}`);

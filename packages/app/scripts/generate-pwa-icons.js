#!/usr/bin/env node

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const svgPath = join(rootDir, 'public/favicon.svg');
const outputDir = join(rootDir, 'public');

mkdirSync(outputDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

// PWA and favicon sizes
const icons = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

console.log('Generating PWA icons from SVG...');

for (const { size, name } of icons) {
  const outputPath = join(outputDir, name);
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`  Generated ${size}x${size}: ${name}`);
}

console.log('\nAll PWA icons generated successfully!');

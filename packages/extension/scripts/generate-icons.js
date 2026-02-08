#!/usr/bin/env node

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const svgPath = join(rootDir, 'assets/icon.svg');
const outputDir = join(rootDir, 'assets');

// Ensure output directory exists
mkdirSync(outputDir, { recursive: true });

// Read SVG file
const svgBuffer = readFileSync(svgPath);

// Icon sizes to generate
const sizes = [16, 48, 128];

console.log('Generating PNG icons from SVG...');

// Generate PNG for each size
for (const size of sizes) {
  const outputPath = join(outputDir, `icon-${size}.png`);

  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath);

  console.log(`✓ Generated ${size}x${size} icon: icon-${size}.png`);
}

console.log('\n✅ All icons generated successfully!');

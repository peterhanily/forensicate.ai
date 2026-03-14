import type { TextLayer } from '@forensicate/scanner';

/**
 * Analyze image pixels for potential hidden content using canvas.
 * This is experimental and opt-in — may be slow on large images.
 *
 * Detects:
 * 1. Low-contrast regions that may contain hidden text
 * 2. Suspicious LSB (Least Significant Bit) patterns indicating steganography
 */
export async function analyzeImageForHiddenContent(file: File): Promise<TextLayer[]> {
  const layers: TextLayer[] = [];

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return layers;

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    // Grid-based analysis for performance (don't scan every pixel)
    const gridSize = 16; // Analyze 16x16 blocks
    const cols = Math.ceil(bitmap.width / gridSize);
    const rows = Math.ceil(bitmap.height / gridSize);

    let lowContrastRegions = 0;
    let suspiciousLsbRegions = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const startX = col * gridSize;
        const startY = row * gridSize;
        const endX = Math.min(startX + gridSize, bitmap.width);
        const endY = Math.min(startY + gridSize, bitmap.height);

        let minLum = 255;
        let maxLum = 0;
        let lsbSum = 0;
        let pixelCount = 0;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * bitmap.width + x) * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];

            // Perceived luminance
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            minLum = Math.min(minLum, lum);
            maxLum = Math.max(maxLum, lum);

            // LSB analysis — sum of least significant bits
            lsbSum += (r & 1) + (g & 1) + (b & 1);
            pixelCount++;
          }
        }

        // Very low luminance variance = potentially hidden content area
        const lumRange = maxLum - minLum;
        if (lumRange < 3 && pixelCount > 10) {
          lowContrastRegions++;
        }

        // LSB analysis: in natural images, ~50% of LSBs are 1.
        // Stego tends to create more uniform distribution.
        // Check for anomalous LSB density in this block.
        const expectedLsb = pixelCount * 3 * 0.5; // 3 channels, 50% expected
        const lsbDeviation = Math.abs(lsbSum - expectedLsb) / (pixelCount * 3);
        if (lsbDeviation < 0.02 && pixelCount > 50) {
          // Anomalously uniform LSB distribution
          suspiciousLsbRegions++;
        }
      }
    }

    const totalRegions = rows * cols;
    const lowContrastRatio = lowContrastRegions / totalRegions;
    const lsbRatio = suspiciousLsbRegions / totalRegions;

    if (lowContrastRatio > 0.3) {
      layers.push({
        type: 'low-contrast',
        content: `${(lowContrastRatio * 100).toFixed(1)}% of image regions have very low luminance variance (potential hidden content)`,
        location: `Canvas analysis (${bitmap.width}x${bitmap.height})`,
      });
    }

    if (lsbRatio > 0.4) {
      layers.push({
        type: 'hidden',
        content: `${(lsbRatio * 100).toFixed(1)}% of image regions show anomalous LSB patterns (potential steganography indicator)`,
        location: `Canvas LSB analysis (${bitmap.width}x${bitmap.height})`,
      });
    }
  } catch {
    // Canvas analysis may fail in non-browser environments
  }

  return layers;
}

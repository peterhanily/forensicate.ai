import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromVideo } from '../src/lib/fileExtractors/videoExtractor';

// Polyfill File.arrayBuffer() for jsdom which doesn't support it
beforeAll(() => {
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

/** Build a minimal MP4 file with an ftyp atom and a moov/udta metadata atom */
function buildMP4WithMetadata(atomType: string, text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  // Inner metadata atom: 8-byte header + text
  const innerSize = 8 + textBytes.length;
  const inner = new Uint8Array(innerSize);
  inner[0] = (innerSize >> 24) & 0xFF;
  inner[1] = (innerSize >> 16) & 0xFF;
  inner[2] = (innerSize >> 8) & 0xFF;
  inner[3] = innerSize & 0xFF;
  for (let i = 0; i < 4; i++) inner[4 + i] = atomType.charCodeAt(i);
  inner.set(textBytes, 8);

  // udta container wrapping the inner atom
  const udtaSize = 8 + innerSize;
  const udta = new Uint8Array(udtaSize);
  udta[0] = (udtaSize >> 24) & 0xFF;
  udta[1] = (udtaSize >> 16) & 0xFF;
  udta[2] = (udtaSize >> 8) & 0xFF;
  udta[3] = udtaSize & 0xFF;
  udta[4] = 'u'.charCodeAt(0);
  udta[5] = 'd'.charCodeAt(0);
  udta[6] = 't'.charCodeAt(0);
  udta[7] = 'a'.charCodeAt(0);
  udta.set(inner, 8);

  // moov container wrapping udta
  const moovSize = 8 + udtaSize;
  const moov = new Uint8Array(moovSize);
  moov[0] = (moovSize >> 24) & 0xFF;
  moov[1] = (moovSize >> 16) & 0xFF;
  moov[2] = (moovSize >> 8) & 0xFF;
  moov[3] = moovSize & 0xFF;
  moov[4] = 'm'.charCodeAt(0);
  moov[5] = 'o'.charCodeAt(0);
  moov[6] = 'o'.charCodeAt(0);
  moov[7] = 'v'.charCodeAt(0);
  moov.set(udta, 8);

  // ftyp atom (required for MP4 detection)
  const ftyp = new Uint8Array(12);
  ftyp[0] = 0; ftyp[1] = 0; ftyp[2] = 0; ftyp[3] = 12; // size
  ftyp[4] = 'f'.charCodeAt(0);
  ftyp[5] = 't'.charCodeAt(0);
  ftyp[6] = 'y'.charCodeAt(0);
  ftyp[7] = 'p'.charCodeAt(0);
  ftyp[8] = 'i'.charCodeAt(0); // isom brand
  ftyp[9] = 's'.charCodeAt(0);
  ftyp[10] = 'o'.charCodeAt(0);
  ftyp[11] = 'm'.charCodeAt(0);

  const result = new Uint8Array(ftyp.length + moov.length);
  result.set(ftyp, 0);
  result.set(moov, ftyp.length);
  return result;
}

/** Build a minimal WebM file (EBML header + metadata text) */
function buildWebMWithMetadata(fields: Record<string, string>): Uint8Array {
  // EBML header magic
  const header = new Uint8Array(4);
  header[0] = 0x1A;
  header[1] = 0x45;
  header[2] = 0xDF;
  header[3] = 0xA3;

  const padding = new Uint8Array(50);
  const fieldStr = Object.entries(fields)
    .map(([k, v]) => `${k}\0${v}`)
    .join('\0\0');
  const fieldBytes = new TextEncoder().encode(fieldStr);

  const result = new Uint8Array(4 + padding.length + fieldBytes.length);
  result.set(header, 0);
  result.set(padding, 4);
  result.set(fieldBytes, 4 + padding.length);
  return result;
}

/** Build binary data with embedded SRT subtitle content */
function buildDataWithSRT(srtContent: string): Uint8Array {
  const noise = new Uint8Array(100);
  const srtBytes = new TextEncoder().encode(srtContent);
  const result = new Uint8Array(noise.length + srtBytes.length);
  result.set(noise, 0);
  result.set(srtBytes, noise.length);
  return result;
}

function makeVideoFile(data: Uint8Array, name: string, mime = 'video/mp4'): File {
  return new File([data], name, { type: mime });
}

describe('Video Extractor', () => {
  describe('MP4 metadata parsing', () => {
    it('extracts description from MP4 desc atom', async () => {
      const data = buildMP4WithMetadata('desc', 'A test video description');
      const file = makeVideoFile(data, 'video.mp4');

      const result = await extractFromVideo(file);
      expect(result.fileType).toBe('video');
      expect(result.filename).toBe('video.mp4');
      expect(result.layers.some(l => l.type === 'video-metadata' && l.content.includes('test video description'))).toBe(true);
    });

    it('extracts copyright from MP4 cprt atom', async () => {
      const data = buildMP4WithMetadata('cprt', 'Copyright 2026 Test');
      const file = makeVideoFile(data, 'video.mp4');

      const result = await extractFromVideo(file);
      expect(result.layers.some(l => l.type === 'video-metadata' && l.content.includes('Copyright 2026'))).toBe(true);
    });

    it('detects MP4 container from ftyp atom', async () => {
      const data = buildMP4WithMetadata('desc', 'test');
      const file = makeVideoFile(data, 'video.mp4');

      const result = await extractFromVideo(file);
      expect(result.fileType).toBe('video');
    });
  });

  describe('WebM/MKV metadata parsing', () => {
    it('extracts title from WebM', async () => {
      const data = buildWebMWithMetadata({ TITLE: 'WebM Video Title' });
      const file = makeVideoFile(data, 'video.webm', 'video/webm');

      const result = await extractFromVideo(file);
      expect(result.layers.some(l => l.type === 'video-metadata' && l.content === 'WebM Video Title')).toBe(true);
    });

    it('extracts comment from WebM', async () => {
      const data = buildWebMWithMetadata({ COMMENT: 'A comment in WebM' });
      const file = makeVideoFile(data, 'video.webm', 'video/webm');

      const result = await extractFromVideo(file);
      expect(result.layers.some(l => l.content === 'A comment in WebM')).toBe(true);
    });

    it('extracts description from MKV', async () => {
      const data = buildWebMWithMetadata({ DESCRIPTION: 'MKV video description' });
      const file = makeVideoFile(data, 'video.mkv', 'video/x-matroska');

      const result = await extractFromVideo(file);
      expect(result.layers.some(l => l.content === 'MKV video description')).toBe(true);
    });
  });

  describe('Embedded subtitle detection', () => {
    it('detects embedded SRT subtitles', async () => {
      const srt = [
        '1',
        '00:00:01,000 --> 00:00:04,000',
        'First subtitle line',
        '',
        '2',
        '00:00:05,000 --> 00:00:08,000',
        'Second subtitle line',
      ].join('\n');
      const data = buildDataWithSRT(srt);
      const file = makeVideoFile(data, 'video.mp4');

      const result = await extractFromVideo(file);
      expect(result.layers.some(l => l.type === 'subtitle')).toBe(true);
      const subtitleLayer = result.layers.find(l => l.type === 'subtitle');
      expect(subtitleLayer?.content).toContain('First subtitle line');
    });

    it('detects embedded WebVTT subtitles', async () => {
      const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWebVTT subtitle content';
      const noise = new Uint8Array(50);
      const vttBytes = new TextEncoder().encode(vtt);
      const data = new Uint8Array(noise.length + vttBytes.length);
      data.set(noise, 0);
      data.set(vttBytes, noise.length);
      const file = makeVideoFile(data, 'video.webm', 'video/webm');

      const result = await extractFromVideo(file);
      expect(result.layers.some(l => l.type === 'subtitle')).toBe(true);
      const subtitleLayer = result.layers.find(l => l.type === 'subtitle');
      expect(subtitleLayer?.content).toContain('WEBVTT');
    });
  });

  describe('Generic string extraction', () => {
    it('extracts long readable strings from video binary', async () => {
      const noise = new Uint8Array(200);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 31) + 1;
      const embeddedText = 'This is a long readable string embedded inside the video container data';
      const textBytes = new TextEncoder().encode(embeddedText);
      const data = new Uint8Array(noise.length + textBytes.length + noise.length);
      data.set(noise, 0);
      data.set(textBytes, noise.length);
      data.set(noise, noise.length + textBytes.length);

      const file = makeVideoFile(data, 'unknown.mp4');
      const result = await extractFromVideo(file);

      expect(result.layers.some(l => l.type === 'metadata' && l.content.includes(embeddedText))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles empty video file gracefully', async () => {
      const file = makeVideoFile(new Uint8Array(0), 'empty.mp4');
      const result = await extractFromVideo(file);

      expect(result.fileType).toBe('video');
      expect(result.warnings.some(w => w.includes('No text metadata'))).toBe(true);
    });

    it('handles file with no recognized container', async () => {
      const noise = new Uint8Array(100);
      for (let i = 0; i < noise.length; i++) noise[i] = i % 10;
      const file = makeVideoFile(noise, 'noise.mp4');

      const result = await extractFromVideo(file);
      expect(result.fileType).toBe('video');
    });

    it('returns correct extraction timing', async () => {
      const data = buildMP4WithMetadata('desc', 'Timing Test');
      const file = makeVideoFile(data, 'timing.mp4');

      const result = await extractFromVideo(file);
      expect(result.extractionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File type detection for audio/video', () => {
    it('routes audio files through extractTextFromFile', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const data = new Uint8Array(20);
      const file = new File([data], 'test.mp3', { type: 'audio/mpeg' });

      const result = await extractTextFromFile(file);
      expect(result.fileType).toBe('audio');
    });

    it('routes video files through extractTextFromFile', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const data = new Uint8Array(20);
      const file = new File([data], 'test.mp4', { type: 'video/mp4' });

      const result = await extractTextFromFile(file);
      expect(result.fileType).toBe('video');
    });
  });
});

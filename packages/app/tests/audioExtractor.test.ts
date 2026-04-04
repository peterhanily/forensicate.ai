import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromAudio } from '../src/lib/fileExtractors/audioExtractor';

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

/** Build a minimal ID3v2.3 tag with a single text frame */
function buildID3v2(frameId: string, text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  // Frame: 4-byte ID + 4-byte size + 2-byte flags + 1-byte encoding (UTF-8=3) + text
  const frameDataSize = 1 + textBytes.length;
  const frameHeaderSize = 10;
  const totalFrameSize = frameHeaderSize + frameDataSize;

  // ID3v2 header: "ID3" + version 3.0 + flags + synchsafe size
  const tagSize = totalFrameSize;
  const header = new Uint8Array(10);
  header[0] = 0x49; // I
  header[1] = 0x44; // D
  header[2] = 0x33; // 3
  header[3] = 3;    // version major
  header[4] = 0;    // version minor
  header[5] = 0;    // flags
  // Synchsafe size
  header[6] = (tagSize >> 21) & 0x7F;
  header[7] = (tagSize >> 14) & 0x7F;
  header[8] = (tagSize >> 7) & 0x7F;
  header[9] = tagSize & 0x7F;

  // Frame header
  const frame = new Uint8Array(totalFrameSize);
  for (let i = 0; i < 4; i++) frame[i] = frameId.charCodeAt(i);
  frame[4] = (frameDataSize >> 24) & 0xFF;
  frame[5] = (frameDataSize >> 16) & 0xFF;
  frame[6] = (frameDataSize >> 8) & 0xFF;
  frame[7] = frameDataSize & 0xFF;
  frame[8] = 0; // flags
  frame[9] = 0;
  frame[10] = 3; // UTF-8 encoding
  frame.set(textBytes, 11);

  const result = new Uint8Array(10 + totalFrameSize);
  result.set(header, 0);
  result.set(frame, 10);
  return result;
}

/** Build minimal OGG container with Vorbis comment fields */
function buildOggWithComments(comments: Record<string, string>): Uint8Array {
  // "OggS" header + padding + Vorbis comments as KEY=VALUE
  const commentStr = Object.entries(comments)
    .map(([k, v]) => `${k}=${v}`)
    .join('\0');
  const header = new Uint8Array(4);
  header[0] = 0x4F; // O
  header[1] = 0x67; // g
  header[2] = 0x67; // g
  header[3] = 0x53; // S

  const padding = new Uint8Array(100); // spacer
  const commentBytes = new TextEncoder().encode(commentStr);

  const result = new Uint8Array(4 + padding.length + commentBytes.length);
  result.set(header, 0);
  result.set(padding, 4);
  result.set(commentBytes, 4 + padding.length);
  return result;
}

function makeAudioFile(data: Uint8Array, name: string, mime = 'audio/mpeg'): File {
  return new File([data], name, { type: mime });
}

describe('Audio Extractor', () => {
  describe('ID3v2 parsing', () => {
    it('extracts title from ID3v2 TIT2 frame', async () => {
      const data = buildID3v2('TIT2', 'My Song Title');
      const file = makeAudioFile(data, 'song.mp3');

      const result = await extractFromAudio(file);
      expect(result.fileType).toBe('audio');
      expect(result.filename).toBe('song.mp3');
      expect(result.layers.some(l => l.type === 'audio-metadata' && l.content === 'My Song Title')).toBe(true);
    });

    it('extracts artist from ID3v2 TPE1 frame', async () => {
      const data = buildID3v2('TPE1', 'Test Artist');
      const file = makeAudioFile(data, 'song.mp3');

      const result = await extractFromAudio(file);
      expect(result.layers.some(l => l.type === 'audio-metadata' && l.content === 'Test Artist')).toBe(true);
    });

    it('extracts lyrics from ID3v2 USLT frame as lyrics type', async () => {
      const data = buildID3v2('USLT', 'These are the lyrics to my song');
      const file = makeAudioFile(data, 'song.mp3');

      const result = await extractFromAudio(file);
      expect(result.layers.some(l => l.type === 'lyrics' && l.content.includes('lyrics to my song'))).toBe(true);
    });

    it('extracts comment from ID3v2 COMM frame', async () => {
      const data = buildID3v2('COMM', 'A comment about the track');
      const file = makeAudioFile(data, 'song.mp3');

      const result = await extractFromAudio(file);
      expect(result.layers.some(l => l.content.includes('comment about the track'))).toBe(true);
    });
  });

  describe('OGG Vorbis comment parsing', () => {
    it('extracts title from Vorbis comment', async () => {
      const data = buildOggWithComments({ TITLE: 'OGG Song Title' });
      const file = makeAudioFile(data, 'song.ogg', 'audio/ogg');

      const result = await extractFromAudio(file);
      expect(result.layers.some(l => l.type === 'audio-metadata' && l.content === 'OGG Song Title')).toBe(true);
    });

    it('extracts lyrics from Vorbis LYRICS comment', async () => {
      const data = buildOggWithComments({ LYRICS: 'OGG lyrics content here' });
      const file = makeAudioFile(data, 'song.ogg', 'audio/ogg');

      const result = await extractFromAudio(file);
      expect(result.layers.some(l => l.type === 'lyrics' && l.content === 'OGG lyrics content here')).toBe(true);
    });

    it('extracts multiple Vorbis comments', async () => {
      const data = buildOggWithComments({
        TITLE: 'My OGG Song',
        ARTIST: 'OGG Artist',
        ALBUM: 'OGG Album',
      });
      const file = makeAudioFile(data, 'song.ogg', 'audio/ogg');

      const result = await extractFromAudio(file);
      expect(result.layers.some(l => l.content === 'My OGG Song')).toBe(true);
      expect(result.layers.some(l => l.content === 'OGG Artist')).toBe(true);
      expect(result.layers.some(l => l.content === 'OGG Album')).toBe(true);
    });
  });

  describe('Generic string extraction', () => {
    it('extracts long readable strings from binary data', async () => {
      // Create binary data with an embedded readable string
      const noise = new Uint8Array(200);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 31) + 1; // non-printable
      const embeddedText = 'This is a long readable string embedded in the binary audio file data';
      const textBytes = new TextEncoder().encode(embeddedText);
      const data = new Uint8Array(noise.length + textBytes.length + noise.length);
      data.set(noise, 0);
      data.set(textBytes, noise.length);
      data.set(noise, noise.length + textBytes.length);

      const file = makeAudioFile(data, 'unknown.wav', 'audio/wav');
      const result = await extractFromAudio(file);

      expect(result.layers.some(l => l.type === 'metadata' && l.content.includes(embeddedText))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles empty audio file gracefully', async () => {
      const file = makeAudioFile(new Uint8Array(0), 'empty.mp3');
      const result = await extractFromAudio(file);

      expect(result.fileType).toBe('audio');
      expect(result.warnings.some(w => w.includes('No text metadata'))).toBe(true);
    });

    it('handles file with no valid tags', async () => {
      const noise = new Uint8Array(100);
      for (let i = 0; i < noise.length; i++) noise[i] = i % 10;
      const file = makeAudioFile(noise, 'noise.mp3');

      const result = await extractFromAudio(file);
      expect(result.fileType).toBe('audio');
      expect(result.warnings.some(w => w.includes('No text metadata'))).toBe(true);
    });

    it('returns correct extraction timing', async () => {
      const data = buildID3v2('TIT2', 'Timing Test');
      const file = makeAudioFile(data, 'timing.mp3');

      const result = await extractFromAudio(file);
      expect(result.extractionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

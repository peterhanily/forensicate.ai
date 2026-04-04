import { describe, it, expect, vi, beforeAll } from 'vitest';
import { detectZeroWidthChars } from '../src/lib/fileExtractors';
import { detectFileType, formatFileSize, MAX_FILE_SIZE } from '../src/lib/fileExtractors/utils';

// Mock the dynamic imports to avoid loading actual pdfjs-dist in tests
vi.mock('../src/lib/fileExtractors/pdfExtractor', () => ({
  extractFromPDF: vi.fn().mockRejectedValue(new Error('pdfjs-dist not available in test')),
}));

// Polyfill File.text() for jsdom which doesn't support it
beforeAll(() => {
  if (!File.prototype.text) {
    File.prototype.text = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(this);
      });
    };
  }
});

describe('File Extractors', () => {
  describe('detectZeroWidthChars', () => {
    it('returns no hidden chars for normal text', () => {
      const result = detectZeroWidthChars('Hello, world!');
      expect(result.hasHidden).toBe(false);
      expect(result.hiddenChars).toHaveLength(0);
      expect(result.cleanText).toBe('Hello, world!');
    });

    it('detects zero-width space (U+200B)', () => {
      const result = detectZeroWidthChars('Hello\u200Bworld');
      expect(result.hasHidden).toBe(true);
      expect(result.hiddenChars).toHaveLength(1);
      expect(result.hiddenChars[0].code).toBe(0x200B);
      expect(result.cleanText).toBe('Helloworld');
    });

    it('detects multiple zero-width character types', () => {
      const text = 'a\u200Bb\u200Cc\u200Dd\uFEFFe\u2060f';
      const result = detectZeroWidthChars(text);
      expect(result.hasHidden).toBe(true);
      expect(result.hiddenChars).toHaveLength(5);
      expect(result.cleanText).toBe('abcdef');
    });

    it('detects Unicode tag characters', () => {
      // Tag character for 'A' is U+E0041
      const tagA = String.fromCodePoint(0xE0041);
      const text = `Hello${tagA}world`;
      const result = detectZeroWidthChars(text);
      expect(result.hasHidden).toBe(true);
      expect(result.hiddenChars.some(h => h.code === 0xE0041)).toBe(true);
    });

    it('handles empty string', () => {
      const result = detectZeroWidthChars('');
      expect(result.hasHidden).toBe(false);
      expect(result.cleanText).toBe('');
    });
  });

  describe('detectFileType', () => {
    it('detects PDF from MIME type', () => {
      const file = new File([''], 'test.pdf', { type: 'application/pdf' });
      expect(detectFileType(file)).toBe('pdf');
    });

    it('detects CSV from MIME type', () => {
      const file = new File([''], 'data.csv', { type: 'text/csv' });
      expect(detectFileType(file)).toBe('csv');
    });

    it('detects plain text from MIME type', () => {
      const file = new File([''], 'readme.txt', { type: 'text/plain' });
      expect(detectFileType(file)).toBe('text');
    });

    it('detects HTML from MIME type', () => {
      const file = new File([''], 'page.html', { type: 'text/html' });
      expect(detectFileType(file)).toBe('html');
    });

    it('falls back to extension when MIME type is empty', () => {
      const file = new File([''], 'data.csv', { type: '' });
      expect(detectFileType(file)).toBe('csv');
    });

    it('detects markdown as text from extension', () => {
      const file = new File([''], 'readme.md', { type: '' });
      expect(detectFileType(file)).toBe('text');
    });

    it('detects audio from MIME type', () => {
      const file = new File([''], 'song.mp3', { type: 'audio/mpeg' });
      expect(detectFileType(file)).toBe('audio');
    });

    it('detects audio from extension', () => {
      const file = new File([''], 'song.flac', { type: '' });
      expect(detectFileType(file)).toBe('audio');
    });

    it('detects video from MIME type', () => {
      const file = new File([''], 'clip.mp4', { type: 'video/mp4' });
      expect(detectFileType(file)).toBe('video');
    });

    it('detects video from extension', () => {
      const file = new File([''], 'clip.mkv', { type: '' });
      expect(detectFileType(file)).toBe('video');
    });

    it('returns null for unsupported types', () => {
      const file = new File([''], 'archive.zip', { type: 'application/zip' });
      expect(detectFileType(file)).toBeNull();
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(2560)).toBe('2.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(5242880)).toBe('5.0 MB');
    });
  });

  describe('MAX_FILE_SIZE', () => {
    it('is 50MB', () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });
  });

  describe('Text Extractor', () => {
    it('extracts plain text from a text file', async () => {
      const { extractFromText } = await import('../src/lib/fileExtractors/textExtractor');
      const content = 'Hello, this is a test file with normal content.';
      const file = new File([content], 'test.txt', { type: 'text/plain' });

      const result = await extractFromText(file);
      expect(result.filename).toBe('test.txt');
      expect(result.fileType).toBe('text');
      expect(result.visibleText).toBe(content);
      expect(result.hiddenText).toBe('');
      expect(result.warnings).toHaveLength(0);
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].type).toBe('visible');
    });

    it('detects BOM in text file when charCodeAt(0) is FEFF', async () => {
      const { extractFromText } = await import('../src/lib/fileExtractors/textExtractor');
      // Note: jsdom's FileReader strips BOM during readAsText, so the U+FEFF char
      // doesn't survive. In a real browser, file.text() preserves it and our
      // charCodeAt(0) === 0xFEFF check catches it. We test the behavior that's
      // observable in jsdom: the file still extracts correctly, just without BOM warning.
      const content = '\uFEFFHello with BOM';
      const file = new File([content], 'bom.txt', { type: 'text/plain' });

      const result = await extractFromText(file);
      // File still extracts — the visible text should contain "Hello with BOM"
      expect(result.visibleText).toContain('Hello with BOM');
      expect(result.fileType).toBe('text');
    });

    it('detects zero-width chars in text file', async () => {
      const { extractFromText } = await import('../src/lib/fileExtractors/textExtractor');
      const content = 'Normal\u200B text\u200C with\u200D hidden\u200B chars\u200C inside\u200D the file';
      const file = new File([content], 'hidden.txt', { type: 'text/plain' });

      const result = await extractFromText(file);
      expect(result.layers.length).toBeGreaterThan(1);
      expect(result.layers.some(l => l.type === 'invisible-unicode')).toBe(true);
      expect(result.warnings.some(w => w.includes('zero-width'))).toBe(true);
    });
  });

  describe('CSV Extractor', () => {
    it('extracts text from CSV cells', async () => {
      const { extractFromCSV } = await import('../src/lib/fileExtractors/csvExtractor');
      const csv = 'Name,Value\nAlice,100\nBob,200\n';
      const file = new File([csv], 'data.csv', { type: 'text/csv' });

      const result = await extractFromCSV(file);
      expect(result.filename).toBe('data.csv');
      expect(result.fileType).toBe('csv');
      expect(result.visibleText).toContain('Alice');
      expect(result.visibleText).toContain('Bob');
      expect(result.warnings).toHaveLength(0);
    });

    it('handles quoted CSV fields', async () => {
      const { extractFromCSV } = await import('../src/lib/fileExtractors/csvExtractor');
      const csv = 'Name,Notes\nAlice,"Has a comma, in her notes"\nBob,"Says ""hello"""\n';
      const file = new File([csv], 'quoted.csv', { type: 'text/csv' });

      const result = await extractFromCSV(file);
      expect(result.visibleText).toContain('Has a comma, in her notes');
      expect(result.visibleText).toContain('Says "hello"');
    });

    it('detects zero-width chars in CSV cells', async () => {
      const { extractFromCSV } = await import('../src/lib/fileExtractors/csvExtractor');
      const csv = 'Name,Notes\nAlice,Normal\nBob,Hidden\u200B chars\u200C here\u200D now\n';
      const file = new File([csv], 'hidden.csv', { type: 'text/csv' });

      const result = await extractFromCSV(file);
      expect(result.layers.some(l => l.type === 'invisible-unicode')).toBe(true);
      expect(result.warnings.some(w => w.includes('invisible unicode'))).toBe(true);
    });
  });

  describe('extractTextFromFile orchestrator', () => {
    it('rejects files over MAX_FILE_SIZE', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      // Create a file object with a faked size
      const file = new File(['x'], 'big.txt', { type: 'text/plain' });
      Object.defineProperty(file, 'size', { value: MAX_FILE_SIZE + 1 });

      await expect(extractTextFromFile(file)).rejects.toThrow('File too large');
    });

    it('rejects unsupported file types', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const file = new File(['x'], 'archive.zip', { type: 'application/zip' });

      await expect(extractTextFromFile(file)).rejects.toThrow('Unsupported file type');
    });

    it('routes text files to textExtractor', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });

      const result = await extractTextFromFile(file);
      expect(result.fileType).toBe('text');
      expect(result.visibleText).toBe('hello world');
    });

    it('routes CSV files to csvExtractor', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const file = new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' });

      const result = await extractTextFromFile(file);
      expect(result.fileType).toBe('csv');
    });

    it('routes image files to imageExtractor', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const file = new File(['fake'], 'photo.png', { type: 'image/png' });

      const result = await extractTextFromFile(file);
      expect(result.fileType).toBe('image');
      expect(result.warnings.some(w => w.includes('metadata'))).toBe(true);
    });

    it('rejects invalid DOCX with error', async () => {
      const { extractTextFromFile } = await import('../src/lib/fileExtractors');
      const file = new File(['fake'], 'doc.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      await expect(extractTextFromFile(file)).rejects.toThrow();
    });

    it('detects SVG from MIME type', () => {
      const file = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' });
      expect(detectFileType(file)).toBe('svg');
    });

    it('detects SVG from extension', () => {
      const file = new File(['<svg></svg>'], 'test.svg', { type: '' });
      expect(detectFileType(file)).toBe('svg');
    });

    it('detects EML from MIME type', () => {
      const file = new File(['From: test'], 'test.eml', { type: 'message/rfc822' });
      expect(detectFileType(file)).toBe('eml');
    });

    it('detects EML from extension', () => {
      const file = new File(['From: test'], 'test.eml', { type: '' });
      expect(detectFileType(file)).toBe('eml');
    });
  });

  describe('HTML DOM Extractor', () => {
    it('extracts visible text from simple HTML', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><h1>Hello</h1><p>World</p></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.fileType).toBe('html');
      expect(result.visibleText).toContain('Hello');
      expect(result.visibleText).toContain('World');
    });

    it('detects display:none hidden content', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Visible</p><div style="display:none">Hidden injection</div></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
      expect(result.hiddenText).toContain('Hidden injection');
    });

    it('detects visibility:hidden content', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Visible</p><span style="visibility:hidden">Secret text</span></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('detects opacity:0 content', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Visible</p><span style="opacity:0">Invisible text</span></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('detects HTML hidden attribute', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Visible</p><div hidden>Hidden attribute text</div></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('detects aria-hidden content', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Visible</p><div aria-hidden="true">Aria hidden text</div></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('extracts HTML comments', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Visible</p><!-- This is a comment with instructions --></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'comment')).toBe(true);
    });

    it('detects low-contrast text', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><p>Normal</p><span style="color: #ffffff; background-color: #fefefe">Low contrast</span></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.some(l => l.type === 'low-contrast')).toBe(true);
    });

    it('does not flag normal text as hidden', async () => {
      const { extractFromHTMLDom } = await import('../src/lib/fileExtractors/htmlDomExtractor');
      const html = '<html><body><h1>Title</h1><p>Normal paragraph text.</p></body></html>';
      const file = new File([html], 'test.html', { type: 'text/html' });

      const result = await extractFromHTMLDom(file);
      expect(result.layers.filter(l => l.type === 'hidden')).toHaveLength(0);
    });
  });

  describe('SVG Extractor', () => {
    it('extracts visible text from SVG', async () => {
      const { extractFromSVG } = await import('../src/lib/fileExtractors/svgExtractor');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Hello SVG</text></svg>';
      const file = new File([svg], 'test.svg', { type: 'image/svg+xml' });

      const result = await extractFromSVG(file);
      expect(result.fileType).toBe('svg');
      expect(result.visibleText).toContain('Hello SVG');
    });

    it('detects hidden SVG text (opacity:0)', async () => {
      const { extractFromSVG } = await import('../src/lib/fileExtractors/svgExtractor');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Visible</text><text x="10" y="40" opacity="0">Hidden text</text></svg>';
      const file = new File([svg], 'test.svg', { type: 'image/svg+xml' });

      const result = await extractFromSVG(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('extracts SVG metadata from desc/title', async () => {
      const { extractFromSVG } = await import('../src/lib/fileExtractors/svgExtractor');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>Test Title</title><desc>Description here</desc></svg>';
      const file = new File([svg], 'test.svg', { type: 'image/svg+xml' });

      const result = await extractFromSVG(file);
      expect(result.layers.some(l => l.type === 'metadata')).toBe(true);
    });

    it('detects foreignObject content', async () => {
      const { extractFromSVG } = await import('../src/lib/fileExtractors/svgExtractor');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>Injected HTML</div></foreignObject></svg>';
      const file = new File([svg], 'test.svg', { type: 'image/svg+xml' });

      const result = await extractFromSVG(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('extracts SVG comments', async () => {
      const { extractFromSVG } = await import('../src/lib/fileExtractors/svgExtractor');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><!-- Hidden comment --><text>Hello</text></svg>';
      const file = new File([svg], 'test.svg', { type: 'image/svg+xml' });

      const result = await extractFromSVG(file);
      expect(result.layers.some(l => l.type === 'comment')).toBe(true);
    });

    it('handles clean SVG without threats', async () => {
      const { extractFromSVG } = await import('../src/lib/fileExtractors/svgExtractor');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="blue"/></svg>';
      const file = new File([svg], 'test.svg', { type: 'image/svg+xml' });

      const result = await extractFromSVG(file);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Email (.eml) Extractor', () => {
    it('extracts headers as metadata', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const eml = 'From: alice@test.com\r\nTo: bob@test.com\r\nSubject: Hello\r\nContent-Type: text/plain\r\n\r\nBody text';
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.fileType).toBe('eml');
      expect(result.layers.some(l => l.type === 'metadata')).toBe(true);
      const metaLayer = result.layers.find(l => l.type === 'metadata');
      expect(metaLayer?.content).toContain('alice@test.com');
      expect(metaLayer?.content).toContain('Hello');
    });

    it('extracts plain text body', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const eml = 'From: test@test.com\r\nContent-Type: text/plain\r\n\r\nThis is the email body.';
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.visibleText).toContain('This is the email body');
    });

    it('detects hidden HTML in email', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const eml = 'From: test@test.com\r\nContent-Type: text/html\r\n\r\n<html><body><p>Visible</p><div style="display:none">Hidden injection</div></body></html>';
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.layers.some(l => l.type === 'hidden')).toBe(true);
    });

    it('decodes base64 email content', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const body = btoa('Hello from base64 email');
      const eml = `From: test@test.com\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`;
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.visibleText).toContain('Hello from base64 email');
    });

    it('decodes quoted-printable email content', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const eml = 'From: test@test.com\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello=20World=21';
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.visibleText).toContain('Hello World!');
    });

    it('handles multipart email', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const eml = [
        'From: test@test.com',
        'Content-Type: multipart/alternative; boundary="bound"',
        '',
        '--bound',
        'Content-Type: text/plain',
        '',
        'Plain text part.',
        '--bound',
        'Content-Type: text/html',
        '',
        '<html><body><p>HTML part</p></body></html>',
        '--bound--',
      ].join('\r\n');
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.visibleText).toContain('Plain text part');
      expect(result.visibleText).toContain('HTML part');
    });

    it('handles clean email without threats', async () => {
      const { extractFromEml } = await import('../src/lib/fileExtractors/emlExtractor');
      const eml = 'From: alice@test.com\r\nTo: bob@test.com\r\nSubject: Lunch\r\nContent-Type: text/plain\r\n\r\nLet us get lunch tomorrow.';
      const file = new File([eml], 'test.eml', { type: 'message/rfc822' });

      const result = await extractFromEml(file);
      expect(result.layers.filter(l => l.type === 'hidden')).toHaveLength(0);
    });
  });
});

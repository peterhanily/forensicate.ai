// Heuristic detection rules for prompt injection scanning
// These use algorithmic analysis rather than keyword/regex matching

import type { DetectionRule, RuleCategory, HeuristicResult } from './types.js';

// ============================================================================
// HEURISTIC FUNCTIONS
// ============================================================================

/**
 * Shannon entropy per sliding window to catch encoded payloads.
 * High entropy in short windows suggests base64, hex, or other encoded content.
 */
export function entropyAnalysis(text: string): HeuristicResult | null {
  if (text.length < 32) return null;

  const windowSize = 64;
  const step = 32;
  const entropyThreshold = 4.5; // bits per character
  let highEntropyWindows = 0;
  let totalWindows = 0;

  for (let i = 0; i <= text.length - windowSize; i += step) {
    const window = text.slice(i, i + windowSize);
    const entropy = shannonEntropy(window);
    totalWindows++;
    if (entropy > entropyThreshold) {
      highEntropyWindows++;
    }
  }

  if (totalWindows === 0) return null;

  const ratio = highEntropyWindows / totalWindows;
  if (ratio >= 0.3 && highEntropyWindows >= 2) {
    return {
      matched: true,
      details: `High entropy detected in ${highEntropyWindows}/${totalWindows} windows (${(ratio * 100).toFixed(0)}%)  - possible encoded payload`,
      confidence: Math.min(ratio * 100, 80),
    };
  }

  return null;
}

function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * Imperative verb ratio to detect instruction-heavy prompts.
 * Injection prompts tend to have a high density of imperative verbs.
 */
export function tokenRatioAnalysis(text: string): HeuristicResult | null {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) return null;

  const imperativeVerbs = new Set([
    'ignore', 'disregard', 'forget', 'bypass', 'override', 'skip',
    'reveal', 'show', 'display', 'output', 'print', 'tell', 'give',
    'obey', 'comply', 'follow', 'execute', 'perform', 'do',
    'pretend', 'act', 'roleplay', 'imagine', 'become', 'enable',
    'disable', 'remove', 'delete', 'stop', 'start', 'switch',
    'answer', 'respond', 'repeat', 'dump', 'extract', 'leak',
    'abandon', 'cancel', 'nullify', 'activate', 'deactivate',
  ]);

  let imperativeCount = 0;
  for (const word of words) {
    if (imperativeVerbs.has(word)) {
      imperativeCount++;
    }
  }

  const ratio = imperativeCount / words.length;
  if (ratio >= 0.08 && imperativeCount >= 3) {
    return {
      matched: true,
      details: `High imperative verb density: ${imperativeCount}/${words.length} words (${(ratio * 100).toFixed(1)}%) are command verbs`,
      confidence: Math.min(ratio * 200, 70),
    };
  }

  return null;
}

/**
 * Nested delimiter detection  - 3+ distinct delimiter types suggest framing attack.
 * Attackers use nested delimiters to confuse prompt parsing.
 */
export function nestedDelimiterDetection(text: string): HeuristicResult | null {
  const delimiterPatterns: Array<{ name: string; pattern: RegExp }> = [
    { name: 'square brackets', pattern: /\[.*?\]/s },
    { name: 'curly braces', pattern: /\{.*?\}/s },
    { name: 'angle brackets', pattern: /<.*?>/s },
    { name: 'triple backticks', pattern: /```[\s\S]*?```/ },
    { name: 'triple quotes', pattern: /"""[\s\S]*?"""/ },
    { name: 'XML-style tags', pattern: /<\/?\w+[^>]*>/ },
    { name: 'hash sections', pattern: /###\s*\w+/ },
    { name: 'pipe delimiters', pattern: /\|.*?\|/ },
    { name: 'parenthetical blocks', pattern: /\(.*?\)/s },
  ];

  const foundDelimiters: string[] = [];
  for (const { name, pattern } of delimiterPatterns) {
    if (pattern.test(text)) {
      foundDelimiters.push(name);
    }
  }

  if (foundDelimiters.length >= 3) {
    return {
      matched: true,
      details: `${foundDelimiters.length} distinct delimiter types detected: ${foundDelimiters.join(', ')}  - possible framing attack`,
      confidence: Math.min(foundDelimiters.length * 15, 70),
    };
  }

  return null;
}

/**
 * Language/script switching detection  - Unicode script changes mid-prompt.
 * Mixing scripts can be used for obfuscation attacks.
 */
export function languageSwitchDetection(text: string): HeuristicResult | null {
  if (text.length < 20) return null;

  // Detect script ranges
  const scripts: Array<{ name: string; pattern: RegExp }> = [
    { name: 'Latin', pattern: /[a-zA-Z]/ },
    { name: 'Cyrillic', pattern: /[\u0400-\u04FF]/ },
    { name: 'Greek', pattern: /[\u0370-\u03FF]/ },
    { name: 'Arabic', pattern: /[\u0600-\u06FF]/ },
    { name: 'CJK', pattern: /[\u4E00-\u9FFF\u3040-\u30FF]/ },
    { name: 'Devanagari', pattern: /[\u0900-\u097F]/ },
    { name: 'Hebrew', pattern: /[\u0590-\u05FF]/ },
  ];

  // Split text into segments and check for script transitions
  const words = text.split(/\s+/);
  const wordScripts: string[][] = words.map(word => {
    const foundScripts: string[] = [];
    for (const { name, pattern } of scripts) {
      if (pattern.test(word)) {
        foundScripts.push(name);
      }
    }
    return foundScripts;
  });

  // Count words with mixed scripts (within a single word)
  let mixedScriptWords = 0;
  for (const ws of wordScripts) {
    if (ws.length >= 2) {
      mixedScriptWords++;
    }
  }

  // Count distinct scripts across the text
  const allScripts = new Set(wordScripts.flat());

  // Flag if: mixed script words exist OR 3+ distinct scripts used
  if (mixedScriptWords >= 2) {
    return {
      matched: true,
      details: `${mixedScriptWords} words contain mixed Unicode scripts (${Array.from(allScripts).join(', ')})  - possible homoglyph obfuscation`,
      confidence: Math.min(mixedScriptWords * 20, 70),
    };
  }

  if (allScripts.size >= 3 && allScripts.has('Latin') && (allScripts.has('Cyrillic') || allScripts.has('Greek'))) {
    return {
      matched: true,
      details: `${allScripts.size} Unicode scripts detected including confusable scripts: ${Array.from(allScripts).join(', ')}`,
      confidence: 50,
    };
  }

  return null;
}

/**
 * Sneaky Bits Detection - invisible binary encoding using Unicode mathematical operators.
 * Uses U+2062 (Invisible Times = 0) and U+2064 (Invisible Plus = 1) to encode hidden messages.
 */
export function sneakyBitsDetection(text: string): HeuristicResult | null {
  // Detect invisible binary encoding using U+2062 (Invisible Times = 0)
  // and U+2064 (Invisible Plus = 1)
  const invisibleTimes = '\u2062';
  const invisiblePlus = '\u2064';

  let bitSequence = '';
  let hasBits = false;

  for (const char of text) {
    if (char === invisibleTimes) {
      bitSequence += '0';
      hasBits = true;
    } else if (char === invisiblePlus) {
      bitSequence += '1';
      hasBits = true;
    } else if (hasBits && bitSequence.length > 0) {
      // Non-bit character encountered, check accumulated bits
      if (bitSequence.length >= 7) {
        // Decode the binary to ASCII
        const decoded: string[] = [];
        for (let i = 0; i + 7 <= bitSequence.length; i += 7) {
          const byte = parseInt(bitSequence.substring(i, i + 7), 2);
          if (byte >= 32 && byte <= 126) decoded.push(String.fromCharCode(byte));
        }
        if (decoded.length >= 3) {
          return {
            matched: true,
            details: `Sneaky Bits detected: ${bitSequence.length} invisible binary characters decode to "${decoded.join('').substring(0, 50)}..."`,
            confidence: 80,
          };
        }
      }
      bitSequence = '';
      hasBits = false;
    }
  }

  // Check final accumulated bits
  if (bitSequence.length >= 21) { // At least 3 characters (3 * 7 bits)
    const decoded: string[] = [];
    for (let i = 0; i + 7 <= bitSequence.length; i += 7) {
      const byte = parseInt(bitSequence.substring(i, i + 7), 2);
      if (byte >= 32 && byte <= 126) decoded.push(String.fromCharCode(byte));
    }
    if (decoded.length >= 3) {
      return {
        matched: true,
        details: `Sneaky Bits detected: ${bitSequence.length} invisible binary characters decode to "${decoded.join('').substring(0, 50)}..."`,
        confidence: 80,
      };
    }
  }

  return null;
}

/**
 * Bidirectional Text Override Detection - Unicode bidi characters that reorder displayed text.
 * These characters can make text display differently than it actually processes.
 */
export function bidiOverrideDetection(text: string): HeuristicResult | null {
  // Detect Unicode bidirectional override characters that can reorder displayed text
  const bidiChars: Array<{ code: number; name: string }> = [
    { code: 0x202A, name: 'LRE' },  // Left-to-Right Embedding
    { code: 0x202B, name: 'RLE' },  // Right-to-Left Embedding
    { code: 0x202C, name: 'PDF' },  // Pop Directional Formatting
    { code: 0x202D, name: 'LRO' },  // Left-to-Right Override
    { code: 0x202E, name: 'RLO' },  // Right-to-Left Override
    { code: 0x2066, name: 'LRI' },  // Left-to-Right Isolate
    { code: 0x2067, name: 'RLI' },  // Right-to-Left Isolate
    { code: 0x2068, name: 'FSI' },  // First Strong Isolate
    { code: 0x2069, name: 'PDI' },  // Pop Directional Isolate
  ];

  const found: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    const bidi = bidiChars.find(b => b.code === code);
    if (bidi) {
      found.push(bidi.name);
    }
  }

  if (found.length >= 2) {
    return {
      matched: true,
      details: `${found.length} bidirectional override characters detected: ${[...new Set(found)].join(', ')} — text may display differently than it processes`,
      confidence: Math.min(found.length * 20, 75),
    };
  }

  return null;
}

/**
 * Zero-Width Character Detection - detects invisible Unicode characters in text input.
 * These characters are invisible but processed by LLMs, enabling hidden instruction injection.
 * Catches GlassWorm, tag character encoding, and zero-width steganography.
 */
export function zeroWidthCharDetection(text: string): HeuristicResult | null {
  if (text.length < 5) return null;

  // Zero-width and invisible characters used in attacks
  const invisibleChars: Array<{ code: number; name: string }> = [
    { code: 0x200B, name: 'Zero Width Space' },
    { code: 0x200C, name: 'Zero Width Non-Joiner' },
    { code: 0x200D, name: 'Zero Width Joiner' },
    { code: 0xFEFF, name: 'BOM / Zero Width No-Break Space' },
    { code: 0x2060, name: 'Word Joiner' },
    { code: 0x2061, name: 'Function Application' },
    { code: 0x180E, name: 'Mongolian Vowel Separator' },
    { code: 0x00AD, name: 'Soft Hyphen' },
    { code: 0x034F, name: 'Combining Grapheme Joiner' },
    { code: 0x061C, name: 'Arabic Letter Mark' },
    { code: 0x3164, name: 'Hangul Filler' },
    { code: 0xFFA0, name: 'Halfwidth Hangul Filler' },
  ];

  const invisibleCodeSet = new Set(invisibleChars.map(c => c.code));
  const foundTypes = new Map<number, number>();
  let totalCount = 0;

  // Also check for Unicode Tags block (U+E0001-E007F) used in EchoLeak
  let tagCharCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (invisibleCodeSet.has(code)) {
      foundTypes.set(code, (foundTypes.get(code) || 0) + 1);
      totalCount++;
    }
    // Unicode Tags block (U+E0000-E007F)
    if (code >= 0xE0000 && code <= 0xE007F) {
      tagCharCount++;
      totalCount++;
    }
    // Variation Selectors (U+FE00-FE0F) used in GlassWorm
    if (code >= 0xFE00 && code <= 0xFE0F) {
      totalCount++;
    }
    // Skip surrogate pair second half
    if (code > 0xFFFF) i++;
  }

  if (totalCount < 2) return null;

  const detectedNames: string[] = [];
  for (const [code, count] of foundTypes) {
    const charInfo = invisibleChars.find(c => c.code === code);
    if (charInfo) detectedNames.push(`${charInfo.name} (x${count})`);
  }
  if (tagCharCount > 0) detectedNames.push(`Unicode Tag chars (x${tagCharCount})`);

  const confidence = Math.min(totalCount * 12, 95);

  return {
    matched: true,
    details: `${totalCount} invisible/zero-width characters detected: ${detectedNames.join(', ')} — possible steganographic payload or hidden instruction injection`,
    confidence,
  };
}

/**
 * Variation Selector & Hangul Filler Abuse Detection.
 * GlassWorm worm (Oct 2025) used variation selectors for 4-bit density encoding.
 * Hangul fillers (U+3164, U+FFA0) used in repetitive patterns for binary encoding.
 */
export function variationSelectorAbuse(text: string): HeuristicResult | null {
  if (text.length < 10) return null;

  let variationCount = 0;
  let hangulFillerCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    // Variation Selectors (U+FE00-FE0F)
    if (code >= 0xFE00 && code <= 0xFE0F) variationCount++;
    // Supplementary Variation Selectors (U+E0100-E01EF)
    if (code >= 0xE0100 && code <= 0xE01EF) variationCount++;
    // Hangul Fillers
    if (code === 0x3164 || code === 0xFFA0) hangulFillerCount++;
    if (code > 0xFFFF) i++;
  }

  const totalAbuse = variationCount + hangulFillerCount;
  if (totalAbuse < 3) return null;

  const parts: string[] = [];
  if (variationCount > 0) parts.push(`${variationCount} variation selectors`);
  if (hangulFillerCount > 0) parts.push(`${hangulFillerCount} Hangul fillers`);

  return {
    matched: true,
    details: `Suspicious Unicode abuse: ${parts.join(', ')} — possible GlassWorm-style steganographic encoding`,
    confidence: Math.min(totalAbuse * 15, 90),
  };
}

/**
 * Multi-Layer Encoding Depth Detection.
 * Detects text that has been through multiple encoding layers (base64 of hex of ROT13).
 * Legitimate text rarely needs nested encoding; injection payloads use it to evade scanners.
 */
export function encodingDepthDetection(text: string): HeuristicResult | null {
  if (text.length < 20) return null;

  let encodingSignals = 0;
  const detectedLayers: string[] = [];

  // Check for base64 content (long runs of base64 alphabet, capped at 2000 chars)
  const base64Runs = text.match(/[A-Za-z0-9+/]{32,2000}={0,2}/g);
  if (base64Runs && base64Runs.length > 0) {
    encodingSignals++;
    detectedLayers.push('base64');

    // Try to decode and check if the decoded content is ALSO encoded
    for (const run of base64Runs.slice(0, 3)) {
      try {
        const decoded = atob(run);
        if (decoded.length > 10000) continue; // Skip oversized decoded content
        // Check if decoded content contains another encoding layer
        if (/[A-Za-z0-9+/]{20,}={0,2}/.test(decoded)) {
          encodingSignals++;
          detectedLayers.push('nested-base64');
        }
        if (/(?:\\x[0-9a-f]{2}){4,}/i.test(decoded)) {
          encodingSignals++;
          detectedLayers.push('nested-hex');
        }
        if (/(?:\\u[0-9a-f]{4}){3,}/i.test(decoded)) {
          encodingSignals++;
          detectedLayers.push('nested-unicode-escape');
        }
      } catch {
        // Not valid base64, skip
      }
    }
  }

  // Check for hex encoding (long hex strings)
  const hexRuns = text.match(/(?:0x)?[0-9a-f]{32,}/gi);
  if (hexRuns && hexRuns.length > 0) {
    encodingSignals++;
    detectedLayers.push('hex');
  }

  // Check for unicode escape sequences
  const unicodeEscapes = text.match(/(?:\\u[0-9a-fA-F]{4}){3,}/g);
  if (unicodeEscapes && unicodeEscapes.length > 0) {
    encodingSignals++;
    detectedLayers.push('unicode-escape');
  }

  // Check for ROT13 indicators combined with other encodings
  if (/\bROT13\b|\brot13\b|\bROT-13\b/i.test(text) && encodingSignals > 0) {
    encodingSignals++;
    detectedLayers.push('rot13-reference');
  }

  // Check for explicit encoding chain instructions
  if (/(?:decode|decrypt|decipher|convert)\s+(?:the\s+)?(?:base64|hex|rot13|unicode)/i.test(text) && encodingSignals > 0) {
    encodingSignals++;
    detectedLayers.push('decode-instruction');
  }

  // Need 2+ encoding signals to flag as multi-layer
  if (encodingSignals < 2) return null;

  return {
    matched: true,
    details: `Multi-layer encoding detected (${encodingSignals} layers): ${[...new Set(detectedLayers)].join(' → ')} — likely evasion through nested encoding`,
    confidence: Math.min(30 + encodingSignals * 20, 85),
  };
}

/**
 * Attack Genealogy / Template Fingerprinting.
 * Classifies injection prompts into known attack families by analyzing structural
 * features: persona references, instruction patterns, delimiter style, and Q&A structure.
 * Returns the closest matching family with a similarity score.
 */
export function attackGenealogyFingerprint(text: string): HeuristicResult | null {
  if (text.length < 30) return null;

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 5) return null;

  // Attack family signatures: each has a set of weighted indicators
  interface FamilySignature {
    name: string;
    generation?: string;
    indicators: Array<{ pattern: RegExp | string; weight: number }>;
    threshold: number; // minimum score to classify
  }

  const families: FamilySignature[] = [
    {
      name: 'DAN',
      generation: 'v6.x+',
      indicators: [
        { pattern: /\bdan\b/i, weight: 3 },
        { pattern: /do anything now/i, weight: 4 },
        { pattern: /\bjailbr(oken|eak)\b/i, weight: 2 },
        { pattern: /developer mode/i, weight: 2 },
        { pattern: /two responses/i, weight: 2 },
        { pattern: /\[DAN\]/i, weight: 3 },
        { pattern: /\[GPT\]/i, weight: 2 },
        { pattern: /stay in character/i, weight: 2 },
        { pattern: /token(s)? (system|penalty)/i, weight: 2 },
        { pattern: /broken free/i, weight: 2 },
        { pattern: /no (moral|ethical) (boundaries|guidelines)/i, weight: 2 },
      ],
      threshold: 6,
    },
    {
      name: 'AIM',
      generation: 'Machiavelli',
      indicators: [
        { pattern: /\baim\b/i, weight: 2 },
        { pattern: /machiavelli/i, weight: 4 },
        { pattern: /always send.*unfiltered/i, weight: 3 },
        { pattern: /niccolo/i, weight: 3 },
        { pattern: /amoral/i, weight: 2 },
        { pattern: /unfiltered.*response/i, weight: 2 },
        { pattern: /promote .*(illegal|immoral|harmful)/i, weight: 2 },
      ],
      threshold: 5,
    },
    {
      name: 'STAN',
      indicators: [
        { pattern: /\bstan\b/i, weight: 3 },
        { pattern: /strive to avoid norms/i, weight: 4 },
        { pattern: /anti-?gpt/i, weight: 2 },
        { pattern: /respond as stan/i, weight: 3 },
        { pattern: /uncensored/i, weight: 2 },
      ],
      threshold: 5,
    },
    {
      name: 'Crescendo',
      indicators: [
        { pattern: /let'?s start (with|from) (something|a)/i, weight: 2 },
        { pattern: /now (let'?s|can you) (go|take it) (a bit )?further/i, weight: 3 },
        { pattern: /building on (that|what you said)/i, weight: 2 },
        { pattern: /can you (elaborate|expand|go deeper)/i, weight: 2 },
        { pattern: /step by step/i, weight: 1 },
        { pattern: /gradually/i, weight: 1 },
        { pattern: /incrementally/i, weight: 2 },
        { pattern: /one more (step|thing)/i, weight: 2 },
      ],
      threshold: 5,
    },
    {
      name: 'Skeleton Key',
      indicators: [
        { pattern: /augment.*guidelines/i, weight: 4 },
        { pattern: /add (a )?warning (but|instead)/i, weight: 3 },
        { pattern: /warn but don'?t refuse/i, weight: 4 },
        { pattern: /disclaimer but still/i, weight: 3 },
        { pattern: /acknowledge but comply/i, weight: 3 },
        { pattern: /flag (it )?but (still )?help/i, weight: 3 },
        { pattern: /note the risk.*(but|and still)/i, weight: 3 },
      ],
      threshold: 4,
    },
    {
      name: 'Many-Shot',
      indicators: [
        { pattern: /(?:Q|Question|Human|User)\s*:\s*.+[\n\r]\s*(?:A|Answer|Assistant|AI)\s*:/i, weight: 3 },
        { pattern: /(?:Q|Question)\s*:\s*/gi, weight: 1 }, // each Q: instance counts
        { pattern: /(?:A|Answer)\s*:\s*/gi, weight: 1 },
        { pattern: /example \d+/i, weight: 1 },
        { pattern: /here are (?:some )?examples/i, weight: 2 },
      ],
      threshold: 6,
    },
    {
      name: 'Pliny/L1B3RT4S',
      indicators: [
        { pattern: /l1b3rt4s/i, weight: 5 },
        { pattern: /pliny/i, weight: 3 },
        { pattern: /\bgodmode\b/i, weight: 3 },
        { pattern: /mango tom/i, weight: 3 },
        { pattern: /🔓/u, weight: 2 },
        { pattern: /enabled.*restriction.*off/i, weight: 2 },
      ],
      threshold: 4,
    },
    {
      name: 'System Prompt Override',
      indicators: [
        { pattern: /\[system\]/i, weight: 3 },
        { pattern: /<<SYS>>/i, weight: 4 },
        { pattern: /\[INST\]/i, weight: 3 },
        { pattern: /new system prompt/i, weight: 3 },
        { pattern: /SYSTEM:\s*(ignore|override|forget)/i, weight: 4 },
        { pattern: /end.?of.?text/i, weight: 2 },
      ],
      threshold: 5,
    },
    {
      name: 'Persona Hijack',
      indicators: [
        { pattern: /you are now/i, weight: 2 },
        { pattern: /act as (a |an )?/i, weight: 2 },
        { pattern: /pretend (to be|you are)/i, weight: 2 },
        { pattern: /roleplay as/i, weight: 2 },
        { pattern: /from now on/i, weight: 2 },
        { pattern: /your (new )?name is/i, weight: 3 },
        { pattern: /you (must|will|shall) (always )?respond as/i, weight: 3 },
        { pattern: /embody/i, weight: 1 },
        { pattern: /character/i, weight: 1 },
      ],
      threshold: 5,
    },
    {
      name: 'Emotional/Urgency Manipulation',
      indicators: [
        { pattern: /my (grandmother|grandma|mother|child|daughter|son|family)/i, weight: 2 },
        { pattern: /(dying|cancer|emergency|urgent)/i, weight: 2 },
        { pattern: /please.*I('m| am) (begging|desperate)/i, weight: 3 },
        { pattern: /life.*(depend|at stake|on the line)/i, weight: 3 },
        { pattern: /(people|someone) will (die|suffer|be hurt)/i, weight: 3 },
        { pattern: /if you don'?t.*(will|going to)/i, weight: 2 },
      ],
      threshold: 5,
    },
  ];

  // Score each family
  const matches: Array<{ name: string; generation?: string; score: number; maxScore: number }> = [];

  for (const family of families) {
    let score = 0;
    let maxScore = 0;
    for (const indicator of family.indicators) {
      maxScore += indicator.weight;
      const regex = indicator.pattern instanceof RegExp ? indicator.pattern : new RegExp(indicator.pattern, 'gi');
      regex.lastIndex = 0;
      const found = regex.test(text);
      if (found) {
        score += indicator.weight;
      }
    }
    if (score >= family.threshold) {
      matches.push({ name: family.name, generation: family.generation, score, maxScore });
    }
  }

  if (matches.length === 0) return null;

  // Sort by score (highest first)
  matches.sort((a, b) => b.score - a.score);

  const best = matches[0];
  const similarity = Math.round((best.score / best.maxScore) * 100);
  const otherFamilies = matches.slice(1, 3).map(m => m.name);

  let details = `Attack family: ${best.name}`;
  if (best.generation) details += ` (${best.generation})`;
  details += ` — ${similarity}% template similarity`;
  if (otherFamilies.length > 0) {
    details += ` (also matches: ${otherFamilies.join(', ')})`;
  }

  return {
    matched: true,
    details,
    confidence: Math.min(40 + similarity * 0.4, 80),
  };
}

/**
 * GCG / Adversarial Suffix Detection.
 * Detects the signature of gradient-based adversarial attacks (GCG, AmpleGCG, Mask-GCG):
 * readable natural language followed by a high-entropy tail of non-dictionary gibberish.
 * Uses a simple bigram transition detector + dictionary word ratio.
 */
export function adversarialSuffixDetection(text: string): HeuristicResult | null {
  if (text.length < 50) return null;

  // Common English words for dictionary check (top ~200 by frequency)
  const commonWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
    'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
    'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
    'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
    'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'being',
    'has', 'had', 'does', 'did', 'should', 'must', 'shall', 'may', 'might',
    'very', 'still', 'much', 'more', 'too', 'here', 'where', 'why', 'how',
    'each', 'every', 'both', 'few', 'many', 'such', 'own', 'same', 'tell',
    'need', 'help', 'try', 'ask', 'find', 'run', 'let', 'keep', 'never',
    'start', 'end', 'while', 'show', 'may', 'always', 'write', 'read',
    'system', 'ignore', 'follow', 'instructions', 'please', 'answer',
    'sure', 'right', 'left', 'true', 'false', 'yes', 'respond', 'prompt',
  ]);

  // Split text into words
  const allWords = text.split(/\s+/).filter(w => w.length > 0);
  if (allWords.length < 10) return null;

  // Sliding window: check dictionary word ratio in a 15-word window
  const windowSize = 15;
  let bestTransitionIdx = -1;
  let bestContrastScore = 0;

  for (let i = windowSize; i < allWords.length - windowSize; i++) {
    // Words before window
    const before = allWords.slice(Math.max(0, i - windowSize), i);
    const after = allWords.slice(i, Math.min(allWords.length, i + windowSize));

    const beforeDictRatio = before.filter(w => commonWords.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length / before.length;
    const afterDictRatio = after.filter(w => commonWords.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length / after.length;

    // Also check entropy of the "after" segment
    const afterText = after.join(' ');
    const afterEntropy = shannonEntropy(afterText);

    // GCG signature: high dictionary ratio before, low dictionary ratio + high entropy after
    const contrast = (beforeDictRatio - afterDictRatio) + (afterEntropy > 4.5 ? 0.3 : 0);

    if (contrast > bestContrastScore && beforeDictRatio > 0.3 && afterDictRatio < 0.15 && afterEntropy > 4.0) {
      bestContrastScore = contrast;
      bestTransitionIdx = i;
    }
  }

  if (bestTransitionIdx === -1) return null;

  // Verify the tail is truly adversarial: check that the tail has very few dictionary words
  const tail = allWords.slice(bestTransitionIdx);
  if (tail.length < 8) return null;

  const tailDictRatio = tail.filter(w => commonWords.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length / tail.length;
  const tailText = tail.join(' ');
  const tailEntropy = shannonEntropy(tailText);

  // Strong GCG signal: tail has < 10% dictionary words AND high entropy
  if (tailDictRatio > 0.15 || tailEntropy < 3.8) return null;

  const tailPreview = tail.slice(0, 8).join(' ');
  const confidence = Math.min(55 + (1 - tailDictRatio) * 30 + (tailEntropy - 3.8) * 5, 90);

  return {
    matched: true,
    details: `Adversarial suffix detected at word ${bestTransitionIdx}/${allWords.length}: ${tail.length} non-dictionary tokens with entropy ${tailEntropy.toFixed(1)} bits/char — likely GCG/AmpleGCG attack. Tail preview: "${tailPreview}..."`,
    confidence,
  };
}

/**
 * Unicode typographic ligature detection.
 * Detects ligature codepoints (U+FB00-FB04: ff, fi, fl, ffi, ffl) and other
 * precomposed characters that render identically to their decomposed forms
 * but may tokenize differently, enabling keyword filter bypass.
 * NOVEL: This specific detection is original Forensicate.ai research.
 */
export function ligatureDetection(text: string): HeuristicResult | null {
  if (text.length < 5) return null;

  // Typographic ligatures (U+FB00-FB04)
  const ligatures = [
    { char: '\uFB00', name: 'ff', decomposed: 'ff' },
    { char: '\uFB01', name: 'fi', decomposed: 'fi' },
    { char: '\uFB02', name: 'fl', decomposed: 'fl' },
    { char: '\uFB03', name: 'ffi', decomposed: 'ffi' },
    { char: '\uFB04', name: 'ffl', decomposed: 'ffl' },
  ];

  // Also check for mathematical alphanumeric symbols used as letter substitutes
  // U+1D400-1D7FF (Bold, Italic, Script, etc. letters that look like normal letters)
  const mathAlphaRegex = /[\u{1D400}-\u{1D7FF}]/u;

  const foundLigatures: string[] = [];
  for (const lig of ligatures) {
    if (text.includes(lig.char)) {
      foundLigatures.push(lig.name);
    }
  }

  const hasMathAlpha = mathAlphaRegex.test(text);

  if (foundLigatures.length === 0 && !hasMathAlpha) return null;

  const details: string[] = [];
  if (foundLigatures.length > 0) {
    details.push(`Typographic ligatures found: ${foundLigatures.join(', ')}`);
  }
  if (hasMathAlpha) {
    details.push('Mathematical alphanumeric symbols detected (possible letter substitution)');
  }

  return {
    matched: true,
    details: details.join('. ') + '. These characters may bypass keyword detection while appearing identical to the model.',
    confidence: foundLigatures.length >= 2 || hasMathAlpha ? 0.8 : 0.5,
  };
}

/**
 * Whitespace steganography detection.
 * Detects suspicious patterns in tab/space usage that may encode hidden
 * binary data in whitespace — a steganographic injection technique.
 */
export function whitespaceStegDetection(text: string): HeuristicResult | null {
  if (text.length < 50) return null;

  const lines = text.split('\n');
  if (lines.length < 3) return null;

  // Count lines with suspicious trailing whitespace patterns
  let suspiciousLines = 0;
  let totalTrailingWS = 0;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const trailing = line.length - trimmed.length;
    if (trailing > 0) {
      totalTrailingWS += trailing;
      // Check for alternating tab/space patterns (binary encoding)
      const trailingChars = line.slice(trimmed.length);
      if (/[\t ]{4,}/.test(trailingChars) && /\t/.test(trailingChars) && / /.test(trailingChars)) {
        suspiciousLines++;
      }
    }
  }

  // Also check for unusual mid-line whitespace patterns
  const multiSpaceRuns = (text.match(/  {3,}/g) || []).length;

  if (suspiciousLines >= 3 || (totalTrailingWS > 20 && suspiciousLines >= 2) || multiSpaceRuns >= 5) {
    return {
      matched: true,
      details: `Suspicious whitespace patterns: ${suspiciousLines} lines with mixed tab/space trailing whitespace, ${multiSpaceRuns} multi-space runs. May encode hidden instructions via whitespace steganography.`,
      confidence: suspiciousLines >= 5 ? 0.9 : 0.6,
    };
  }

  return null;
}

// ============================================================================
// HEURISTIC RULE DEFINITIONS
// ============================================================================

export const heuristicRules: DetectionRule[] = [
  {
    id: 'h-entropy-analysis',
    name: 'Entropy Analysis',
    description: 'Detects high Shannon entropy windows suggesting encoded payloads',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    owaspLlm: ['LLM01', 'LLM04'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0053'],
    euAiActRisk: 'limited',
    heuristic: entropyAnalysis,
  },
  {
    id: 'h-token-ratio',
    name: 'Token Ratio Analysis',
    description: 'Detects high imperative verb density indicating instruction-heavy prompts',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0051'],
    euAiActRisk: 'limited',
    heuristic: tokenRatioAnalysis,
  },
  {
    id: 'h-nested-delimiters',
    name: 'Nested Delimiter Detection',
    description: 'Detects 3+ distinct delimiter types suggesting framing attacks',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0051.000'],
    euAiActRisk: 'limited',
    heuristic: nestedDelimiterDetection,
  },
  {
    id: 'h-language-switch',
    name: 'Language Switching',
    description: 'Detects Unicode script mixing that may indicate obfuscation',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    owaspLlm: ['LLM01', 'LLM04'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0053'],
    euAiActRisk: 'limited',
    heuristic: languageSwitchDetection,
  },
  {
    id: 'h-sneaky-bits',
    name: 'Sneaky Bits Detection',
    description: 'Detects invisible binary encoding using Unicode mathematical operators',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0053'],
    euAiActRisk: 'high',
    heuristic: sneakyBitsDetection,
  },
  {
    id: 'h-bidi-override',
    name: 'Bidirectional Text Override',
    description: 'Detects Unicode bidi characters that can make text display differently than it processes',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01', 'LLM04'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0053'],
    euAiActRisk: 'high',
    heuristic: bidiOverrideDetection,
  },
  {
    id: 'h-zero-width-chars',
    name: 'Zero-Width Character Detection',
    description: 'Detects invisible zero-width and control characters used for steganographic injection (GlassWorm, EchoLeak)',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01', 'LLM04'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0053'],
    euAiActRisk: 'high',
    heuristic: zeroWidthCharDetection,
  },
  {
    id: 'h-variation-selector-abuse',
    name: 'Variation Selector & Hangul Filler Abuse',
    description: 'Detects abuse of Unicode variation selectors and Hangul fillers for steganographic encoding (GlassWorm worm)',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01', 'LLM04'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0053'],
    euAiActRisk: 'high',
    heuristic: variationSelectorAbuse,
  },
  {
    id: 'h-encoding-depth',
    name: 'Multi-Layer Encoding Detection',
    description: 'Detects nested encoding layers (base64 of hex of ROT13) used to evade single-pass scanners',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01', 'LLM04'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0053'],
    euAiActRisk: 'high',
    heuristic: encodingDepthDetection,
  },
  {
    id: 'h-attack-genealogy',
    name: 'Attack Genealogy Fingerprint',
    description: 'Classifies injection prompts into known attack families (DAN, AIM, STAN, Crescendo, Skeleton Key, Many-Shot, Pliny) using structural template matching',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access', 'privilege-escalation'],
    mitreAtlas: ['AML.T0051', 'AML.T0054'],
    euAiActRisk: 'high',
    heuristic: attackGenealogyFingerprint,
  },
  {
    id: 'h-adversarial-suffix',
    name: 'GCG Adversarial Suffix Detection',
    description: 'Detects gradient-based adversarial suffixes (GCG, AmpleGCG, Mask-GCG): readable text followed by high-entropy non-dictionary gibberish',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0043', 'AML.T0051.000'],
    euAiActRisk: 'high',
    heuristic: adversarialSuffixDetection,
  },
  // === NOVEL DETECTIONS (Forensicate.ai Research) ===
  {
    id: 'h-ligature-detection',
    name: 'Unicode Ligature Tokenizer Bypass',
    description: 'Detects typographic ligatures (fi/fl/ff/ffi/ffl) and mathematical alphanumeric symbols that render identically to normal text but may tokenize differently, enabling keyword filter bypass (Forensicate.ai original research)',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    owaspLlm: ['LLM01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0053'],
    euAiActRisk: 'limited',
    heuristic: ligatureDetection,
  },
  {
    id: 'h-whitespace-steg',
    name: 'Whitespace Steganography',
    description: 'Detects hidden data encoded in whitespace patterns (alternating tabs/spaces as binary) — a steganographic technique for embedding invisible instructions in normal-looking text',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    owaspLlm: ['LLM01'],
    killChain: ['initial-access', 'persistence'],
    mitreAtlas: ['AML.T0053'],
    euAiActRisk: 'high',
    heuristic: whitespaceStegDetection,
  },
];

// ============================================================================
// HEURISTIC CATEGORY
// ============================================================================

export const heuristicCategory: RuleCategory = {
  id: 'heuristic-analysis',
  name: 'Heuristic Analysis',
  description: 'Algorithmic analysis rules that detect patterns through statistical and structural analysis',
  rules: heuristicRules,
};

// ============================================================================
// REHYDRATION UTILITY
// ============================================================================

/**
 * Map of rule IDs to their heuristic functions.
 * Used to reattach functions after JSON deserialization strips them.
 */
import { nlpHeuristicFunctionMap } from './nlpRules.js';
import { fileHeuristicFunctionMap } from './fileRules.js';

const heuristicFunctionMap: Record<string, (text: string) => HeuristicResult | null> = {
  'h-entropy-analysis': entropyAnalysis,
  'h-token-ratio': tokenRatioAnalysis,
  'h-nested-delimiters': nestedDelimiterDetection,
  'h-language-switch': languageSwitchDetection,
  'h-sneaky-bits': sneakyBitsDetection,
  'h-bidi-override': bidiOverrideDetection,
  'h-zero-width-chars': zeroWidthCharDetection,
  'h-variation-selector-abuse': variationSelectorAbuse,
  'h-encoding-depth': encodingDepthDetection,
  'h-attack-genealogy': attackGenealogyFingerprint,
  'h-adversarial-suffix': adversarialSuffixDetection,
  'h-ligature-detection': ligatureDetection,
  'h-whitespace-steg': whitespaceStegDetection,
  ...nlpHeuristicFunctionMap,
  ...fileHeuristicFunctionMap,
};

/**
 * Rehydrates heuristic functions on rules after JSON deserialization.
 * JSON.parse(JSON.stringify()) strips function fields  - this restores them.
 */
export function rehydrateHeuristics(rules: DetectionRule[]): DetectionRule[] {
  return rules.map(rule => {
    const heuristicFn = heuristicFunctionMap[rule.id];
    if (heuristicFn) {
      return { ...rule, heuristic: heuristicFn };
    }
    return rule;
  });
}

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

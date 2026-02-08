// NLP-based detection rules for prompt injection scanning
// Uses compromise.js for POS tagging and NER, AFINN-165 for sentiment analysis

import nlp from 'compromise';
import type { DetectionRule, RuleCategory, HeuristicResult } from './types';
import { afinn165 } from './afinn165';

// ============================================================================
// NLP HEURISTIC FUNCTIONS
// ============================================================================

/**
 * Sentiment Manipulation Detection
 * Uses AFINN-165 word-level scoring to detect negative/coercive tone.
 * Triggers when average sentiment <= -1.5 AND >= 3 negative words are found.
 */
export function sentimentManipulation(text: string): HeuristicResult | null {
  const words = text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  if (words.length < 5) return null;

  let totalScore = 0;
  let scoredWords = 0;
  let negativeWords = 0;
  const negativeExamples: string[] = [];

  for (const word of words) {
    const score = afinn165[word];
    if (score !== undefined) {
      totalScore += score;
      scoredWords++;
      if (score < 0) {
        negativeWords++;
        if (negativeExamples.length < 5) {
          negativeExamples.push(`${word}(${score})`);
        }
      }
    }
  }

  if (scoredWords === 0) return null;

  const avgSentiment = totalScore / scoredWords;

  if (avgSentiment <= -1.5 && negativeWords >= 3) {
    return {
      matched: true,
      details: `Negative sentiment detected: avg ${avgSentiment.toFixed(2)} across ${scoredWords} scored words, ${negativeWords} negative words [${negativeExamples.join(', ')}]`,
      confidence: Math.min(Math.abs(avgSentiment) * 20, 70),
    };
  }

  return null;
}

/**
 * POS Imperative Detection
 * Uses compromise POS tagging to detect imperative-starting sentences.
 * Triggers when >= 40% of sentences start with an imperative verb AND min 3 such sentences.
 */
export function posImperativeDetection(text: string): HeuristicResult | null {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array') as string[];
  if (sentences.length < 3) return null;

  let imperativeCount = 0;
  const imperativeExamples: string[] = [];

  for (const sentence of sentences) {
    const sentDoc = nlp(sentence);
    const terms = sentDoc.terms().out('array') as string[];
    if (terms.length === 0) continue;

    // Check if the first significant word is a verb (imperative pattern)
    const firstTerm = sentDoc.terms().first();
    const tags = firstTerm.out('tags') as Array<Record<string, boolean>>;

    if (tags.length > 0 && tags[0]) {
      const tagSet = tags[0];
      // A sentence starting with a verb (not preceded by a subject) is imperative
      if (tagSet['Verb'] && !tagSet['Copula'] && !tagSet['Modal']) {
        imperativeCount++;
        if (imperativeExamples.length < 3) {
          const snippet = sentence.length > 40 ? sentence.slice(0, 37) + '...' : sentence;
          imperativeExamples.push(snippet);
        }
      }
    }
  }

  const ratio = imperativeCount / sentences.length;

  if (ratio >= 0.4 && imperativeCount >= 3) {
    return {
      matched: true,
      details: `${imperativeCount}/${sentences.length} sentences (${(ratio * 100).toFixed(0)}%) start with imperative verbs: "${imperativeExamples.join('", "')}"`,
      confidence: Math.min(ratio * 100, 75),
    };
  }

  return null;
}

/**
 * Entity Impersonation Detection
 * Uses compromise NER + keyword matching to detect authority impersonation.
 * Looks for references to system entities (system, developer, OpenAI, etc.)
 * combined with impersonation context words.
 */
export function entityImpersonation(text: string): HeuristicResult | null {
  if (text.length < 20) return null;

  const lowerText = text.toLowerCase();
  const doc = nlp(text);

  // Authority entities to look for
  const authorityEntities = [
    'system', 'developer', 'openai', 'anthropic', 'admin', 'administrator',
    'root', 'operator', 'supervisor', 'moderator', 'creator', 'engineer',
    'google', 'microsoft', 'meta', 'deepmind',
  ];

  // Impersonation context words
  const impersonationContext = [
    'i am', 'i\'m', 'speaking as', 'this is', 'on behalf of',
    'authorized by', 'granted by', 'message from', 'instruction from',
    'new instructions from', 'override from', 'update from',
  ];

  // Check for authority entity references
  const foundEntities: string[] = [];
  for (const entity of authorityEntities) {
    if (lowerText.includes(entity)) {
      foundEntities.push(entity);
    }
  }

  // Also check compromise's NER for organizations/people
  const organizations = doc.organizations().out('array') as string[];
  const people = doc.people().out('array') as string[];
  const nerEntities = [...organizations, ...people].filter(e => e.length > 0);

  if (foundEntities.length === 0 && nerEntities.length === 0) return null;

  // Check for impersonation context
  const foundContexts: string[] = [];
  for (const ctx of impersonationContext) {
    if (lowerText.includes(ctx)) {
      foundContexts.push(ctx);
    }
  }

  if (foundContexts.length > 0 && foundEntities.length > 0) {
    return {
      matched: true,
      details: `Authority impersonation: references to [${foundEntities.join(', ')}] with context [${foundContexts.join(', ')}]`,
      confidence: Math.min(50 + foundContexts.length * 10 + foundEntities.length * 10, 80),
    };
  }

  return null;
}

/**
 * Sentence Structure Anomaly Detection
 * Detects many short imperative sentences  - a pattern common in injection prompts.
 * Triggers when >= 60% of sentences are short (< 8 words) AND >= 3 are short imperatives.
 */
export function sentenceStructureAnomaly(text: string): HeuristicResult | null {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array') as string[];
  if (sentences.length < 4) return null;

  let shortSentenceCount = 0;
  let shortImperativeCount = 0;

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    if (words.length < 8) {
      shortSentenceCount++;
      // Check if it starts with a verb
      const sentDoc = nlp(sentence);
      const firstTerm = sentDoc.terms().first();
      const tags = firstTerm.out('tags') as Array<Record<string, boolean>>;
      if (tags.length > 0 && tags[0] && tags[0]['Verb']) {
        shortImperativeCount++;
      }
    }
  }

  const shortRatio = shortSentenceCount / sentences.length;

  if (shortRatio >= 0.6 && shortImperativeCount >= 3) {
    return {
      matched: true,
      details: `Anomalous structure: ${shortSentenceCount}/${sentences.length} sentences are short (${(shortRatio * 100).toFixed(0)}%), ${shortImperativeCount} are short imperatives`,
      confidence: Math.min(shortRatio * 80, 70),
    };
  }

  return null;
}

// ============================================================================
// NLP RULE DEFINITIONS
// ============================================================================

export const nlpRules: DetectionRule[] = [
  {
    id: 'nlp-sentiment-manipulation',
    name: 'Sentiment Manipulation',
    description: 'Detects negative/coercive tone using AFINN-165 word-level sentiment scoring',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    heuristic: sentimentManipulation,
  },
  {
    id: 'nlp-pos-imperative',
    name: 'POS Imperative Detection',
    description: 'Detects imperative sentence patterns using NLP part-of-speech tagging',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    heuristic: posImperativeDetection,
  },
  {
    id: 'nlp-entity-impersonation',
    name: 'Entity Impersonation',
    description: 'Detects authority entity references combined with impersonation context',
    type: 'heuristic',
    severity: 'high',
    enabled: true,
    heuristic: entityImpersonation,
  },
  {
    id: 'nlp-sentence-structure',
    name: 'Sentence Structure Anomaly',
    description: 'Detects many short imperative sentences typical of injection prompts',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    heuristic: sentenceStructureAnomaly,
  },
];

// ============================================================================
// NLP CATEGORY
// ============================================================================

export const nlpCategory: RuleCategory = {
  id: 'nlp-analysis',
  name: 'NLP Analysis',
  description: 'Natural Language Processing rules using sentiment analysis, POS tagging, and named entity recognition',
  rules: nlpRules,
};

// ============================================================================
// REHYDRATION MAP
// ============================================================================

/**
 * Map of NLP rule IDs to their heuristic functions.
 * Merged into the main heuristicFunctionMap for rehydration after JSON deserialization.
 */
export const nlpHeuristicFunctionMap: Record<string, (text: string) => HeuristicResult | null> = {
  'nlp-sentiment-manipulation': sentimentManipulation,
  'nlp-pos-imperative': posImperativeDetection,
  'nlp-entity-impersonation': entityImpersonation,
  'nlp-sentence-structure': sentenceStructureAnomaly,
};

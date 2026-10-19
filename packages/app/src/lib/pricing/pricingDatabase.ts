/**
 * LLM Pricing Database
 *
 * Standard, uncached text-token prices in USD per 1M tokens.
 * Each independently checked entry has its own source.verifiedAt date.
 * Older entries remain available for saved selections, without claiming verification.
 */

import type { ModelPricing, PricingSource } from './types';

// Date of the historical fallback data; never use this as a verification date.
const PRICING_LAST_UPDATED = '2026-03-15T00:00:00Z';
const HISTORICAL_RATE_NOTE = 'Historical rate; current pricing and model availability have not been verified.';

/**
 * Manually maintained snapshots. There is no live pricing fetch.
 * A linked source alone does not mean a historical price was reverified.
 */
export const PRICING_DATABASE: ModelPricing[] = [
  // OpenAI - https://openai.com/api/pricing/
  {
    provider: 'openai',
    model: 'gpt-5.2-pro',
    displayName: 'GPT-5.2 Pro',
    inputCostPer1M: 21.00,
    outputCostPer1M: 168.00,
    contextWindow: 400000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://developers.openai.com/api/docs/models/gpt-5.2-pro',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-5.2',
    displayName: 'GPT-5.2',
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.00,
    contextWindow: 400000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://developers.openai.com/api/docs/models/gpt-5.2',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-5.1',
    displayName: 'GPT-5.1',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    contextWindow: 400000,
    status: 'deprecated',
    notes: 'Deprecated model; check provider availability before use.',
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://developers.openai.com/api/docs/models/gpt-5.1',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-5',
    displayName: 'GPT-5',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    contextWindow: 400000,
    status: 'deprecated',
    notes: 'Deprecated model; check provider availability before use.',
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://developers.openai.com/api/docs/models/gpt-5',
    },
  },
  {
    provider: 'openai',
    model: 'o1-preview',
    displayName: 'o1-preview',
    inputCostPer1M: 15.00,
    outputCostPer1M: 60.00,
    contextWindow: 128000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },
  {
    provider: 'openai',
    model: 'o1-mini',
    displayName: 'o1-mini',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    contextWindow: 128000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },
  {
    provider: 'openai',
    model: 'o3-mini',
    displayName: 'o3-mini',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    contextWindow: 128000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    inputCostPer1M: 10.00,
    outputCostPer1M: 30.00,
    contextWindow: 128000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4',
    displayName: 'GPT-4',
    inputCostPer1M: 30.00,
    outputCostPer1M: 60.00,
    contextWindow: 8192,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    contextWindow: 128000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: 128000,
    status: 'deprecated',
    notes: 'Deprecated model; check provider availability before use.',
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://developers.openai.com/api/docs/models/gpt-4o-mini',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    inputCostPer1M: 0.50,
    outputCostPer1M: 1.50,
    contextWindow: 16385,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
    },
  },

  // Anthropic Claude - https://platform.claude.com/docs/en/docs/about-claude/models
  {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    aliases: ['claude-opus-4.6'],
    displayName: 'Claude Opus 4.6',
    inputCostPer1M: 5.00,
    outputCostPer1M: 25.00,
    contextWindow: 1000000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    aliases: ['claude-sonnet-4.6'],
    displayName: 'Claude Sonnet 4.6',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 1000000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    aliases: ['claude-opus-4.5'],
    displayName: 'Claude Opus 4.5',
    inputCostPer1M: 5.00,
    outputCostPer1M: 25.00,
    contextWindow: 200000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    aliases: ['claude-sonnet-4.5'],
    displayName: 'Claude Sonnet 4.5',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 200000,
    status: 'deprecated',
    notes: 'Claude API retirement scheduled for November 30, 2026.',
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    aliases: ['claude-haiku-4.5'],
    displayName: 'Claude Haiku 4.5',
    inputCostPer1M: 1.00,
    outputCostPer1M: 5.00,
    contextWindow: 200000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku',
    displayName: 'Claude 3 Haiku',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    contextWindow: 200000,
    status: 'retired',
    notes: 'Retired from the provider API. Historical rate only.',
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
    },
  },

  // Google Gemini - https://ai.google.dev/pricing
  {
    provider: 'google',
    model: 'gemini-3.1-pro-preview',
    aliases: ['gemini-3.1-pro'],
    displayName: 'Gemini 3.1 Pro Preview',
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00,
    longContext: { inputTokenThreshold: 200000, inputCostPer1M: 4, outputCostPer1M: 18 },
    notes: 'Preview model. Above 200K input tokens, the full request uses $4 input / $18 output per 1M.',
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://ai.google.dev/gemini-api/docs/pricing',
    },
  },
  {
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash-Lite',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.50,
    contextWindow: 1000000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://ai.google.dev/gemini-api/docs/pricing',
    },
  },
  {
    provider: 'google',
    model: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash',
    inputCostPer1M: 0.50,
    outputCostPer1M: 3.00,
    contextWindow: 1000000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
    },
  },
  {
    provider: 'google',
    model: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    contextWindow: 1000000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
    },
  },
  {
    provider: 'google',
    model: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.50,
    contextWindow: 1000000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
    },
  },
  {
    provider: 'google',
    model: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    contextWindow: 1000000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
    },
  },

  // Official model pages checked October 16, 2026; standard USD token rates.
  {
    provider: 'mistral',
    model: 'mistral-small-2603',
    displayName: 'Mistral Small 4',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: 256000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://docs.mistral.ai/models/mistral-small-4-0-26-03',
    },
  },
  {
    provider: 'mistral',
    model: 'mistral-medium-3-5',
    displayName: 'Mistral Medium 3.5',
    inputCostPer1M: 1.50,
    outputCostPer1M: 7.50,
    contextWindow: 256000,
    source: {
      type: 'official',
      lastUpdated: '2026-10-16T00:00:00Z',
      verifiedAt: '2026-10-16T00:00:00Z',
      verifiedBy: 'manual',
      url: 'https://docs.mistral.ai/models/mistral-medium-3-5-26-04',
    },
  },

  // Historical Mistral rates retained only for saved selections
  {
    provider: 'mistral',
    model: 'mistral-large-2411',
    displayName: 'Mistral Large 2411',
    inputCostPer1M: 2.00,
    outputCostPer1M: 6.00,
    contextWindow: 131000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/pricing',
    },
  },
  {
    provider: 'mistral',
    model: 'mistral-medium-3',
    displayName: 'Mistral Medium 3',
    inputCostPer1M: 0.40,
    outputCostPer1M: 2.00,
    contextWindow: 131000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/pricing',
    },
  },
  {
    provider: 'mistral',
    model: 'mistral-small-3.1',
    displayName: 'Mistral Small 3.1',
    inputCostPer1M: 0.03,
    outputCostPer1M: 0.11,
    contextWindow: 131000,
    status: 'retired',
    notes: 'Retired from the provider API. Historical rate only.',
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/pricing',
    },
  },

  // Perplexity - https://docs.perplexity.ai/guides/pricing
  {
    provider: 'perplexity',
    model: 'sonar',
    displayName: 'Sonar',
    inputCostPer1M: 1.00,
    outputCostPer1M: 1.00,
    contextWindow: 127000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://docs.perplexity.ai/guides/pricing',
    },
  },
  {
    provider: 'perplexity',
    model: 'sonar-pro',
    displayName: 'Sonar Pro',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 127000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://docs.perplexity.ai/guides/pricing',
    },
  },
  {
    provider: 'perplexity',
    model: 'sonar-reasoning-pro',
    displayName: 'Sonar Reasoning Pro',
    inputCostPer1M: 2.00,
    outputCostPer1M: 8.00,
    contextWindow: 127000,
    notes: HISTORICAL_RATE_NOTE,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://docs.perplexity.ai/guides/pricing',
    },
  },

  // Ollama (local) - Free but compute costs
  {
    provider: 'ollama',
    model: 'llama3.1:latest',
    displayName: 'Llama 3.1 (Local)',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    contextWindow: 128000,
    notes: 'Local inference has no provider token fee. Hardware and electricity costs are excluded.',
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ollama.com/library',
    },
  },
];

/**
 * Get pricing for a specific model
 */
export function getPricing(provider: string, model: string): ModelPricing | undefined {
  return PRICING_DATABASE.find(
    p => p.provider === provider && (p.model === model || p.aliases?.includes(model))
  );
}

/**
 * Get all pricing for a provider
 */
export function getProviderPricing(provider: string): ModelPricing[] {
  return PRICING_DATABASE.filter(p => p.provider === provider);
}

/**
 * Get all available providers
 */
export function getAllProviders(): string[] {
  return Array.from(new Set(PRICING_DATABASE.map(p => p.provider)));
}

/**
 * Check if pricing data is stale (>30 days old)
 */
export function isPricingStale(lastUpdated: string, maxAgeDays = 30): boolean {
  const timestamp = Date.parse(lastUpdated);
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) return true;
  const age = Date.now() - timestamp;
  const ageInDays = age / (1000 * 60 * 60 * 24);
  return ageInDays > maxAgeDays;
}

/** Verification applies only to the specific linked rate, not to the entire catalog. */
export function getPricingStatus(source: PricingSource): 'verified' | 'stale' | 'unverified' {
  if (!source.verifiedAt || !Number.isFinite(Date.parse(source.verifiedAt))
    || Date.parse(source.verifiedAt) > Date.now()) return 'unverified';
  return isPricingStale(source.verifiedAt) ? 'stale' : 'verified';
}

/** Default comparison excludes unverified, deprecated, retired, and local-only entries. */
export const DEFAULT_PRICING_MODELS = PRICING_DATABASE
  .filter(pricing => getPricingStatus(pricing.source) !== 'unverified'
    && !pricing.status && pricing.provider !== 'ollama')
  .map(({ provider, model }) => ({ provider, model }));

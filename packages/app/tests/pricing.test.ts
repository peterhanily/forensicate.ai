import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateBatchCost,
  calculateCost,
  DEFAULT_PRICING_MODELS,
  formatCost,
  getPricing,
  getPricingStatus,
  isPricingStale,
} from '../src/lib/pricing';

describe('pricing verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('does not imply that a linked historical rate was recently verified', () => {
    const source = getPricing('perplexity', 'sonar')!.source;
    expect(source.lastUpdated).toBe('2026-03-15T00:00:00Z');
    expect(source.verifiedAt).toBeUndefined();
    expect(getPricingStatus(source)).toBe('unverified');
  });

  it('tracks verification per entry and warns once that check is stale', () => {
    const source = getPricing('openai', 'gpt-5.2-pro')!.source;
    expect(getPricingStatus(source)).toBe('verified');
    vi.setSystemTime(new Date('2026-11-16T00:00:00Z'));
    expect(getPricingStatus(source)).toBe('stale');
  });

  it.each(['', 'invalid', '2030-01-01T00:00:00Z'])(
    'does not trust an invalid or future verification date: %s', verifiedAt => {
      expect(isPricingStale(verifiedAt)).toBe(true);
      expect(getPricingStatus({ type: 'official', lastUpdated: verifiedAt, verifiedAt }))
        .toBe('unverified');
    },
  );

  it('excludes unchecked and unavailable entries from the default comparison', () => {
    expect(DEFAULT_PRICING_MODELS.length).toBeGreaterThan(5);
    for (const { provider, model } of DEFAULT_PRICING_MODELS) {
      const pricing = getPricing(provider, model)!;
      expect(pricing.source.verifiedAt).toBeDefined();
      expect(pricing.status).toBeUndefined();
      expect(provider).not.toBe('ollama');
    }
    expect(DEFAULT_PRICING_MODELS).not.toContainEqual({ provider: 'mistral', model: 'mistral-small-3.1' });
    expect(DEFAULT_PRICING_MODELS).not.toContainEqual({ provider: 'anthropic', model: 'claude-3-haiku' });
    expect(DEFAULT_PRICING_MODELS).not.toContainEqual({ provider: 'perplexity', model: 'sonar' });
  });

  it('preserves saved estimator IDs while exposing the official model ID', () => {
    expect(getPricing('anthropic', 'claude-sonnet-4.6')?.model).toBe('claude-sonnet-4-6');
    expect(getPricing('google', 'gemini-3.1-pro')?.model).toBe('gemini-3.1-pro-preview');
  });
});

describe('standard text cost estimates', () => {
  it('uses the verified Pro rates instead of the much cheaper non-Pro rates', () => {
    const estimate = calculateCost('text', 'openai', 'gpt-5.2-pro', 100)!;
    expect(estimate.inputCostPer1M).toBe(21);
    expect(estimate.outputCostPer1M).toBe(168);
    expect(estimate.totalCost).toBeCloseTo(0.016821);
  });

  it('applies the full-request Gemini long-context rate only above 200K input tokens', () => {
    const atBoundary = calculateCost('a'.repeat(800000), 'google', 'gemini-3.1-pro-preview', 100)!;
    const aboveBoundary = calculateCost('a'.repeat(800001), 'google', 'gemini-3.1-pro-preview', 100)!;
    expect(atBoundary.inputCostPer1M).toBe(2);
    expect(atBoundary.outputCostPer1M).toBe(12);
    expect(atBoundary.totalCost).toBeCloseTo(0.4012);
    expect(aboveBoundary.inputCostPer1M).toBe(4);
    expect(aboveBoundary.outputCostPer1M).toBe(18);
    expect(aboveBoundary.totalCost).toBeCloseTo(0.801804);
  });

  it('applies context tiers per request when aggregating a batch', () => {
    const estimate = calculateBatchCost(['text', 'a'.repeat(800001)], 'google', 'gemini-3.1-pro-preview', 100)!;
    expect(estimate.totalCost).toBeCloseTo(0.803006);
    expect(estimate.testCount).toBe(2);
  });

  it('reports an empty batch as zero cost instead of NaN', () => {
    expect(calculateBatchCost([], 'openai', 'gpt-5.2')?.avgCostPerTest).toBe(0);
  });

  it('does not describe an estimate that excludes compute costs as free', () => {
    expect(formatCost(0)).toBe('$0.00');
  });
});

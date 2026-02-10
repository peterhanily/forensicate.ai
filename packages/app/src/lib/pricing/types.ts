/**
 * Pricing types for LLM cost estimation
 */

export interface PricingSource {
  type: 'official' | 'community' | 'fallback';
  lastUpdated: string; // ISO date
  verifiedBy?: string;
  url?: string; // Link to official pricing page
}

export interface ModelPricing {
  provider: string;
  model: string;
  displayName: string; // User-friendly name

  // Costs in USD per 1M tokens
  inputCostPer1M: number;
  outputCostPer1M: number;

  // Metadata
  contextWindow: number;
  source: PricingSource;
  notes?: string;
}

export interface CostEstimate {
  provider: string;
  model: string;
  displayName: string;
  inputTokens: number;
  estimatedOutputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  source: PricingSource;
}

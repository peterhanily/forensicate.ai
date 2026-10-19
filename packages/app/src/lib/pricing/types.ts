/**
 * Pricing types for LLM cost estimation
 */

export interface PricingSource {
  type: 'official' | 'community' | 'fallback';
  lastUpdated: string; // ISO date when the recorded rate was updated
  verifiedAt?: string; // ISO date of an independent check against the linked source
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
  longContext?: {
    inputTokenThreshold: number; // Higher rates apply above, not at, this boundary
    inputCostPer1M: number;
    outputCostPer1M: number;
  };

  // Metadata
  contextWindow?: number;
  aliases?: string[]; // Previous estimator IDs, for saved selections
  status?: 'deprecated' | 'retired';
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
  inputCostPer1M: number;
  outputCostPer1M: number;
  notes?: string;
  status?: ModelPricing['status'];
  source: PricingSource;
}

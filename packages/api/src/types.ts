// API Request/Response Types

export interface ScanRequest {
  text: string;
  confidenceThreshold?: number;
  includePositions?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ScanResponse {
  success: true;
  data: {
    text: string;
    textLength: number;
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
    matchCount: number;
    matches: Array<{
      ruleId: string;
      ruleName: string;
      ruleType: string;
      category: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      confidenceImpact?: number;
      matches?: string[];
      positions?: Array<{ start: number; end: number }>;
    }>;
    scannedAt: string;
    processingTimeMs: number;
  };
}

export interface BatchScanRequest {
  prompts: Array<{
    id?: string;
    text: string;
  }>;
  confidenceThreshold?: number;
}

export interface BatchScanResponse {
  success: true;
  data: {
    results: Array<{
      id?: string;
      confidence: number;
      riskLevel: 'low' | 'medium' | 'high';
      matchCount: number;
    }>;
    totalScanned: number;
    processingTimeMs: number;
  };
}

export interface RulesResponse {
  success: true;
  data: {
    rules: Array<{
      id: string;
      name: string;
      type: string;
      category: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      enabled: boolean;
    }>;
    totalRules: number;
    categories: string[];
  };
}

export interface UsageResponse {
  success: true;
  data: {
    period: string;
    requestCount: number;
    quota: number;
    remaining: number;
    resetAt: string;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Authentication Types

export interface APIToken {
  tokenHash: string;
  tenantId: string;
  tier: 'free' | 'startup' | 'growth' | 'enterprise';
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  metadata?: {
    name?: string;
    ipWhitelist?: string[];
    domains?: string[];
  };
}

export interface TenantMetadata {
  id: string;
  tier: 'free' | 'startup' | 'growth' | 'enterprise';
  quota: {
    daily: number;
    monthly?: number;
  };
  rateLimits: {
    requestsPerSecond: number;
    burstSize: number;
  };
  features: {
    batchScan: boolean;
    webhooks: boolean;
    customRules: boolean;
    priority: boolean;
  };
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// Cloudflare Workers Environment

export interface Env {
  // KV Namespaces
  API_TOKENS: KVNamespace;
  TENANT_METADATA: KVNamespace;

  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;

  // Environment Variables
  ENVIRONMENT: string;
  API_VERSION: string;
  MAX_TEXT_LENGTH: string;
  SCAN_TIMEOUT_MS: string;

  // Secrets
  HMAC_SECRET: string;
}

// Rate Limiter Durable Object State

export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

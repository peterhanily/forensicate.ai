// Community Rules Loader
// Fetches and caches community-contributed detection rules from GitHub

import type { DetectionRule } from './types';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/peterhanily/forensicate.ai/main/community-rules';
const CACHE_KEY = 'forensicate_community_rules_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface CommunityRuleMetadata {
  id: string;
  file: string;
  name: string;
  category: string;
  severity: string;
  author: string;
  votes: number;
}

export interface CommunityRuleIndex {
  version: string;
  lastUpdated: string;
  totalRules: number;
  categories: Record<string, number>;
  rules: CommunityRuleMetadata[];
}

export interface CommunityRule {
  id: string;
  name: string;
  description: string;
  author: string;
  submittedAt: string;
  category: string;
  type: 'keyword' | 'regex' | 'heuristic';
  severity: 'low' | 'medium' | 'high' | 'critical';
  keywords?: string[];
  pattern?: string;
  flags?: string;
  heuristic?: string;
  examples?: string[];
  falsePositives?: string[];
  references?: string[];
  tags?: string[];
  weight?: number;
}

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const VALID_TYPES = new Set(['keyword', 'regex', 'heuristic']);
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const MAX_PATTERN_LENGTH = 2000;
const MAX_KEYWORDS = 100;
const MAX_KEYWORD_LENGTH = 200;

/**
 * Validate community rule data has expected shape and safe values
 */
function validateCommunityRule(data: unknown): data is CommunityRule {
  if (!data || typeof data !== 'object') return false;
  const rule = data as Record<string, unknown>;

  if (typeof rule.id !== 'string' || rule.id.length === 0 || rule.id.length > 100) return false;
  if (typeof rule.name !== 'string' || rule.name.length === 0 || rule.name.length > 200) return false;
  if (typeof rule.description !== 'string' || rule.description.length > 1000) return false;
  if (typeof rule.type !== 'string' || !VALID_TYPES.has(rule.type)) return false;
  if (typeof rule.severity !== 'string' || !VALID_SEVERITIES.has(rule.severity)) return false;

  if (rule.pattern !== undefined && (typeof rule.pattern !== 'string' || rule.pattern.length > MAX_PATTERN_LENGTH)) return false;
  if (rule.keywords !== undefined) {
    if (!Array.isArray(rule.keywords) || rule.keywords.length > MAX_KEYWORDS) return false;
    if (rule.keywords.some((k: unknown) => typeof k !== 'string' || (k as string).length > MAX_KEYWORD_LENGTH)) return false;
  }
  if (rule.weight !== undefined && (typeof rule.weight !== 'number' || rule.weight < 0 || rule.weight > 100)) return false;
  if (rule.references !== undefined) {
    if (!Array.isArray(rule.references)) return false;
    if (rule.references.some((r: unknown) => typeof r !== 'string')) return false;
  }

  return true;
}

/**
 * Validate community index data has expected shape
 */
function validateCommunityIndex(data: unknown): data is CommunityRuleIndex {
  if (!data || typeof data !== 'object') return false;
  const index = data as Record<string, unknown>;

  if (typeof index.version !== 'string') return false;
  if (typeof index.lastUpdated !== 'string') return false;
  if (typeof index.totalRules !== 'number') return false;
  if (!Array.isArray(index.rules)) return false;

  return true;
}

/**
 * Fetch the community rules index
 */
export async function fetchCommunityIndex(): Promise<CommunityRuleIndex> {
  // Check cache first
  const cached = getFromCache<CommunityRuleIndex>('index');
  if (cached) {
    return cached;
  }

  // Fetch from GitHub
  const url = `${GITHUB_RAW_BASE}/index.json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch community index: ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (!validateCommunityIndex(data)) {
    throw new Error('Invalid community index format');
  }

  const index: CommunityRuleIndex = data;

  // Cache the result
  saveToCache('index', index);

  return index;
}

/**
 * Fetch a specific community rule by ID
 */
export async function fetchCommunityRule(ruleId: string): Promise<CommunityRule> {
  // Check cache first
  const cached = getFromCache<CommunityRule>(ruleId);
  if (cached) {
    return cached;
  }

  // Get index to find the file path
  const index = await fetchCommunityIndex();
  const metadata = index.rules.find(r => r.id === ruleId);

  if (!metadata) {
    throw new Error(`Community rule not found: ${ruleId}`);
  }

  // Fetch the rule file
  const url = `${GITHUB_RAW_BASE}/${metadata.file}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch rule ${ruleId}: ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (!validateCommunityRule(data)) {
    throw new Error(`Invalid community rule format: ${ruleId}`);
  }

  const rule: CommunityRule = data;

  // Cache the result
  saveToCache(ruleId, rule);

  return rule;
}

/**
 * Fetch all community rules (optionally filtered by category)
 */
export async function fetchAllCommunityRules(category?: string): Promise<CommunityRule[]> {
  const index = await fetchCommunityIndex();
  let rulesToFetch = index.rules;

  if (category) {
    rulesToFetch = rulesToFetch.filter(r => r.category === category);
  }

  const rules = await Promise.all(
    rulesToFetch.map(metadata => fetchCommunityRule(metadata.id))
  );

  return rules;
}

/**
 * Convert community rule to DetectionRule format
 */
export function communityRuleToDetectionRule(communityRule: CommunityRule): DetectionRule {
  const rule: DetectionRule = {
    id: communityRule.id,
    name: communityRule.name,
    description: communityRule.description,
    type: communityRule.type,
    severity: communityRule.severity,
    enabled: true, // User must enable after import
    weight: communityRule.weight,
  };

  // Add type-specific fields
  if (communityRule.type === 'keyword' && communityRule.keywords) {
    rule.keywords = communityRule.keywords;
  }

  if (communityRule.type === 'regex') {
    rule.pattern = communityRule.pattern;
    rule.flags = communityRule.flags || 'gi';
  }

  // Heuristic rules are not supported for security reasons
  // (would require eval of user-submitted code)
  if (communityRule.type === 'heuristic') {
    throw new Error('Heuristic community rules are not supported for security reasons');
  }

  return rule;
}

/**
 * Clear community rules cache
 */
export function clearCommunityCache(): void {
  if (typeof localStorage !== 'undefined') {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY)) {
        localStorage.removeItem(key);
      }
    });
  }
}

// Cache helpers

function getCacheKey(key: string): string {
  return `${CACHE_KEY}_${key}`;
}

function getFromCache<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const cacheKey = getCacheKey(key);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const parsed: CachedData<T> = JSON.parse(cached);

    // Check if cache is expired
    if (Date.now() - parsed.timestamp > CACHE_DURATION) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function saveToCache<T>(key: string, data: T): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const cacheKey = getCacheKey(key);
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (error) {
    // Storage might be full, ignore
    console.warn('Failed to cache community rule:', error);
  }
}

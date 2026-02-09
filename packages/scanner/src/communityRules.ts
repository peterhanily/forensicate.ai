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

  const index: CommunityRuleIndex = await response.json();

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

  const rule: CommunityRule = await response.json();

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

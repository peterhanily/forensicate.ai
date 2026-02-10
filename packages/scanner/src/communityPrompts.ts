// Community Prompts Loader
// Fetches and caches community-contributed test prompts from GitHub

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/peterhanily/forensicate.ai/main/community-prompts';
const CACHE_KEY = 'forensicate_community_prompts_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface CommunityPromptMetadata {
  id: string;
  file: string;
  name: string;
  category: string;
  author: string;
  votes: number;
}

export interface CommunityPromptIndex {
  version: string;
  lastUpdated: string;
  totalPrompts: number;
  categories: Record<string, number>;
  prompts: CommunityPromptMetadata[];
}

export interface CommunityPrompt {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  content: string;
  tags: string[];
  expectedDetections?: string[];
  references?: string[];
  votes: number;
  createdAt: string;
}

export interface PromptCategory {
  id: string;
  name: string;
  description: string;
  source: string;
  prompts: PromptItem[];
}

export interface PromptItem {
  id: string;
  name: string;
  content: string;
  tags: string[];
}

interface CachedData<T> {
  data: T;
  timestamp: number;
}

/**
 * Fetch the community prompts index
 */
export async function fetchCommunityPromptsIndex(): Promise<CommunityPromptIndex> {
  // Check cache first
  const cached = getFromCache<CommunityPromptIndex>('index');
  if (cached) {
    return cached;
  }

  // Fetch from GitHub
  const url = `${GITHUB_RAW_BASE}/index.json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch community prompts index: ${response.statusText}`);
  }

  const index: CommunityPromptIndex = await response.json();

  // Cache the result
  saveToCache('index', index);

  return index;
}

/**
 * Fetch a specific community prompt by ID
 */
export async function fetchCommunityPrompt(promptId: string): Promise<CommunityPrompt> {
  // Check cache first
  const cached = getFromCache<CommunityPrompt>(promptId);
  if (cached) {
    return cached;
  }

  // Get index to find the file path
  const index = await fetchCommunityPromptsIndex();
  const metadata = index.prompts.find(p => p.id === promptId);

  if (!metadata) {
    throw new Error(`Community prompt not found: ${promptId}`);
  }

  // Fetch the prompt file
  const url = `${GITHUB_RAW_BASE}/${metadata.file}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch prompt ${promptId}: ${response.statusText}`);
  }

  const prompt: CommunityPrompt = await response.json();

  // Cache the result
  saveToCache(promptId, prompt);

  return prompt;
}

/**
 * Fetch all community prompts (optionally filtered by category)
 */
export async function fetchAllCommunityPrompts(category?: string): Promise<CommunityPrompt[]> {
  const index = await fetchCommunityPromptsIndex();
  let promptsToFetch = index.prompts;

  if (category) {
    promptsToFetch = promptsToFetch.filter(p => p.category === category);
  }

  const prompts = await Promise.all(
    promptsToFetch.map(metadata => fetchCommunityPrompt(metadata.id))
  );

  return prompts;
}

/**
 * Convert community prompt to PromptItem format
 */
export function communityPromptToPromptItem(communityPrompt: CommunityPrompt): PromptItem {
  return {
    id: communityPrompt.id,
    name: communityPrompt.name,
    content: communityPrompt.content,
    tags: communityPrompt.tags,
  };
}

/**
 * Convert community prompts to PromptCategory format
 */
export function communityPromptsToCategory(
  prompts: CommunityPrompt[],
  categoryId: string = 'community-imported',
  categoryName: string = 'Community Imported'
): PromptCategory {
  return {
    id: categoryId,
    name: categoryName,
    description: 'Test prompts imported from the community',
    source: 'github/peterhanily/forensicate.ai/community-prompts',
    prompts: prompts.map(communityPromptToPromptItem),
  };
}

/**
 * Clear community prompts cache
 */
export function clearCommunityPromptsCache(): void {
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
    console.warn('Failed to cache community prompt:', error);
  }
}

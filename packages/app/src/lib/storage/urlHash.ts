import LZString from 'lz-string';
import type { PersistedConfig } from './types';
import { validateConfig } from './storage';

const PARAM_NAME = 'config';

/**
 * Encode configuration to a URL-safe string
 * Uses lz-string compression for shorter URLs
 */
export function encodeConfig(config: PersistedConfig): string {
  try {
    const jsonString = JSON.stringify(config);
    // Use lz-string's URI-safe encoding which compresses and encodes in one step
    const compressed = LZString.compressToEncodedURIComponent(jsonString);
    return compressed;
  } catch (error) {
    console.error('Failed to encode config:', error);
    throw new Error('Failed to encode configuration');
  }
}

/**
 * Decode a URL-safe string back to configuration
 * Supports both lz-string compressed format and legacy base64 format
 */
export function decodeConfig(encoded: string): PersistedConfig | null {
  try {
    // Try lz-string decompression first (new format)
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (decompressed) {
      const data = JSON.parse(decompressed);
      if (validateConfig(data)) {
        return data;
      }
    }

    // Fall back to legacy base64 format for backwards compatibility
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const jsonString = decodeURIComponent(escape(atob(base64)));
    const data = JSON.parse(jsonString);

    if (validateConfig(data)) {
      return data;
    }

    console.warn('Invalid config format in URL');
    return null;
  } catch (error) {
    console.warn('Failed to decode config from URL:', error);
    return null;
  }
}

/**
 * Check if the current URL has a config parameter and return it
 * Works with both HashRouter (standalone) and BrowserRouter (server)
 */
export function getConfigFromUrl(): PersistedConfig | null {
  // Try hash-based query params first (for HashRouter: #/scanner?config=...)
  const hash = window.location.hash;
  if (hash.includes('?')) {
    const hashQuery = hash.split('?')[1];
    const hashParams = new URLSearchParams(hashQuery);
    const hashConfig = hashParams.get(PARAM_NAME);
    if (hashConfig) {
      return decodeConfig(hashConfig);
    }
  }

  // Try standard query params (for BrowserRouter: /scanner?config=...)
  const searchParams = new URLSearchParams(window.location.search);
  const config = searchParams.get(PARAM_NAME);
  if (config) {
    return decodeConfig(config);
  }

  return null;
}

/**
 * Clear the config parameter from URL after loading
 */
export function clearUrlConfig(): void {
  const url = new URL(window.location.href);

  // Handle hash-based query params
  if (url.hash.includes('?')) {
    const [hashPath, hashQuery] = url.hash.split('?');
    const hashParams = new URLSearchParams(hashQuery);
    if (hashParams.has(PARAM_NAME)) {
      hashParams.delete(PARAM_NAME);
      const newHash = hashParams.toString() ? `${hashPath}?${hashParams}` : hashPath;
      url.hash = newHash;
      window.history.replaceState(null, '', url.toString());
      return;
    }
  }

  // Handle standard query params
  if (url.searchParams.has(PARAM_NAME)) {
    url.searchParams.delete(PARAM_NAME);
    window.history.replaceState(null, '', url.toString());
  }
}

/**
 * Generate a shareable URL with the current config
 * Detects router mode and generates appropriate URL format
 */
export function generateShareUrl(config: PersistedConfig): string {
  const encoded = encodeConfig(config);
  const url = new URL(window.location.href);

  // Detect if we're using HashRouter (standalone mode or hash in URL)
  const isHashRouter = url.hash.startsWith('#/');

  if (isHashRouter) {
    // HashRouter: append query to hash portion
    const [hashPath] = url.hash.split('?');
    url.hash = `${hashPath}?${PARAM_NAME}=${encoded}`;
  } else {
    // BrowserRouter: use standard query params
    url.searchParams.set(PARAM_NAME, encoded);
  }

  return url.toString();
}

// Legacy exports for backwards compatibility
export const encodeConfigToHash = encodeConfig;
export const decodeHashToConfig = decodeConfig;
export const clearUrlHash = clearUrlConfig;

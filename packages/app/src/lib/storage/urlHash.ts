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
    // The extension encodes as: btoa(encodeURIComponent(JSON.stringify(config)))
    // So we decode as: JSON.parse(decodeURIComponent(atob(base64)))
    // It does not escape '+', which query parsing turns into a space.
    const jsonString = decodeURIComponent(atob(encoded.replace(/ /g, '+')));
    const data = JSON.parse(jsonString);

    if (validateConfig(data)) {
      return data;
    }

    return null;
  } catch {
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
      url.hash = newHash === '#' ? '' : newHash;
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
  url.searchParams.delete(PARAM_NAME);

  // Detect if we're using HashRouter (standalone mode, as in App.tsx, or a hash route)
  const isHashRouter = url.protocol === 'file:' || import.meta.env.BASE_URL === './' || url.hash.startsWith('#/');

  // HashRouter keeps its route before the query. BrowserRouter also uses the fragment:
  // browsers never send it to the server, so large configs avoid GitHub Pages' 414 limit.
  const [hashPath] = isHashRouter ? url.hash.split('?') : [''];
  url.hash = `${hashPath}?${PARAM_NAME}=${encoded}`;

  return url.toString();
}

// Legacy exports for backwards compatibility
export const encodeConfigToHash = encodeConfig;
export const decodeHashToConfig = decodeConfig;
export const clearUrlHash = clearUrlConfig;

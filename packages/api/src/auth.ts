// Authentication and Authorization

import type { Env, APIToken, TenantMetadata } from './types';

/**
 * Extract API token from Authorization header
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <token>" and "<token>" formats
  const match = authHeader.match(/^(?:Bearer )?(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Validate API token format (fai_[env]_[32-char-base58])
 */
export function validateTokenFormat(token: string): boolean {
  return /^fai_(live|test)_[a-zA-Z0-9]{32}$/.test(token);
}

/**
 * Hash API token using SHA-256
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Authenticate request and return tenant metadata
 */
export async function authenticate(
  request: Request,
  env: Env
): Promise<{ token: APIToken; tenant: TenantMetadata } | null> {
  // Extract token from header
  const token = extractToken(request);
  if (!token) {
    return null;
  }

  // Validate token format
  if (!validateTokenFormat(token)) {
    return null;
  }

  // Hash token for lookup
  const tokenHash = await hashToken(token);

  // Lookup token in KV
  const tokenData = await env.API_TOKENS.get(tokenHash, { type: 'json' });
  if (!tokenData) {
    return null;
  }

  const apiToken = tokenData as APIToken;

  // Check expiration
  if (apiToken.expiresAt) {
    const expiresAt = new Date(apiToken.expiresAt);
    if (expiresAt < new Date()) {
      return null;
    }
  }

  // Lookup tenant metadata
  const tenantData = await env.TENANT_METADATA.get(apiToken.tenantId, { type: 'json' });
  if (!tenantData) {
    return null;
  }

  const tenant = tenantData as TenantMetadata;

  // Track last usage in a separate key to avoid resurrecting revoked tokens
  env.API_TOKENS.put(
    `usage:${tokenHash}`,
    JSON.stringify({ lastUsedAt: new Date().toISOString() }),
    { expirationTtl: 31536000 } // 1 year
  ).catch(console.error);

  return { token: apiToken, tenant };
}

/**
 * Check IP whitelist if configured
 */
export function checkIPWhitelist(
  request: Request,
  token: APIToken
): boolean {
  const whitelist = token.metadata?.ipWhitelist;
  if (!whitelist || whitelist.length === 0) {
    return true; // No whitelist configured
  }

  const clientIP = request.headers.get('CF-Connecting-IP');
  if (!clientIP) {
    return false; // Can't verify IP
  }

  return whitelist.includes(clientIP);
}

/**
 * Check domain whitelist if configured
 */
export function checkDomainWhitelist(
  request: Request,
  token: APIToken
): boolean {
  const whitelist = token.metadata?.domains;
  if (!whitelist || whitelist.length === 0) {
    return true; // No whitelist configured
  }

  const origin = request.headers.get('Origin');
  if (!origin) {
    return false; // No origin header
  }

  try {
    const url = new URL(origin);
    const domain = url.hostname;
    return whitelist.some(allowedDomain => {
      // Support wildcard subdomains (*.example.com)
      if (allowedDomain.startsWith('*.')) {
        const baseDomain = allowedDomain.slice(2);
        return domain === baseDomain || domain.endsWith(`.${baseDomain}`);
      }
      return domain === allowedDomain;
    });
  } catch {
    return false;
  }
}

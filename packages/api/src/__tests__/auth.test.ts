import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractToken, validateTokenFormat, hashToken, authenticate, checkIPWhitelist, checkDomainWhitelist } from '../auth';
import type { APIToken, Env, TenantMetadata } from '../types';

describe('extractToken', () => {
  it('returns null when no Authorization header', () => {
    const req = new Request('https://api.forensicate.ai/', {});
    expect(extractToken(req)).toBeNull();
  });

  it('extracts Bearer token', () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: 'Bearer fai_live_abc123' }
    });
    expect(extractToken(req)).toBe('fai_live_abc123');
  });

  it('extracts plain token without Bearer prefix', () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: 'fai_live_abc123' }
    });
    expect(extractToken(req)).toBe('fai_live_abc123');
  });

  it('trims whitespace from token', () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: 'Bearer  fai_live_abc123  ' }
    });
    expect(extractToken(req)).toBe('fai_live_abc123');
  });

  it('handles case-insensitive Bearer prefix', () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: 'bearer fai_live_abc123' }
    });
    expect(extractToken(req)).toBe('fai_live_abc123');
  });
});

describe('validateTokenFormat', () => {
  it('accepts valid live token', () => {
    expect(validateTokenFormat('fai_live_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });

  it('accepts valid test token', () => {
    expect(validateTokenFormat('fai_test_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });

  it('rejects token without fai_ prefix', () => {
    expect(validateTokenFormat('api_live_abcdefghijklmnopqrstuvwxyz123456')).toBe(false);
  });

  it('rejects token with invalid env segment', () => {
    expect(validateTokenFormat('fai_prod_abcdefghijklmnopqrstuvwxyz123456')).toBe(false);
  });

  it('rejects token with wrong length hash', () => {
    expect(validateTokenFormat('fai_live_abc123')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateTokenFormat('')).toBe(false);
  });

  it('rejects token with special characters', () => {
    expect(validateTokenFormat('fai_live_abcdefghijklmnop!@#$%^&*()')).toBe(false);
  });
});

describe('hashToken', () => {
  it('returns hex string', async () => {
    const hash = await hashToken('test-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', async () => {
    const hash1 = await hashToken('same-token');
    const hash2 = await hashToken('same-token');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', async () => {
    const hash1 = await hashToken('token-1');
    const hash2 = await hashToken('token-2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('authenticate', () => {
  const validToken = 'fai_live_abcdefghijklmnopqrstuvwxyz123456';
  let mockEnv: Env;
  let tokenData: APIToken;
  let tenantData: TenantMetadata;

  beforeEach(() => {
    tokenData = {
      tokenHash: 'hashed',
      tenantId: 'tenant-1',
      tier: 'startup',
      createdAt: '2025-01-01T00:00:00Z',
      metadata: {}
    };

    tenantData = {
      id: 'tenant-1',
      tier: 'startup',
      quota: { daily: 1000 },
      rateLimits: { requestsPerSecond: 10, burstSize: 20 },
      features: { batchScan: false, webhooks: false, customRules: false, priority: false },
      createdAt: '2025-01-01T00:00:00Z'
    };

    mockEnv = {
      API_TOKENS: {
        get: vi.fn().mockResolvedValue(tokenData),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      TENANT_METADATA: {
        get: vi.fn().mockResolvedValue(tenantData),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
      } as unknown as KVNamespace,
      RATE_LIMITER: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      API_VERSION: 'v1',
      MAX_TEXT_LENGTH: '100000',
      SCAN_TIMEOUT_MS: '5000',
      HMAC_SECRET: 'test-secret'
    };
  });

  it('returns token and tenant for valid request', async () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const result = await authenticate(req, mockEnv);
    expect(result).not.toBeNull();
    expect(result!.token).toEqual(tokenData);
    expect(result!.tenant).toEqual(tenantData);
  });

  it('returns null for missing Authorization header', async () => {
    const req = new Request('https://api.forensicate.ai/');
    const result = await authenticate(req, mockEnv);
    expect(result).toBeNull();
  });

  it('returns null for invalid token format', async () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: 'Bearer invalid-token' }
    });
    const result = await authenticate(req, mockEnv);
    expect(result).toBeNull();
  });

  it('returns null when token not found in KV', async () => {
    (mockEnv.API_TOKENS.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const result = await authenticate(req, mockEnv);
    expect(result).toBeNull();
  });

  it('returns null when token is expired', async () => {
    tokenData.expiresAt = '2020-01-01T00:00:00Z'; // expired
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const result = await authenticate(req, mockEnv);
    expect(result).toBeNull();
  });

  it('allows non-expired token', async () => {
    tokenData.expiresAt = '2099-01-01T00:00:00Z'; // far future
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const result = await authenticate(req, mockEnv);
    expect(result).not.toBeNull();
  });

  it('returns null when tenant not found', async () => {
    (mockEnv.TENANT_METADATA.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const result = await authenticate(req, mockEnv);
    expect(result).toBeNull();
  });

  it('records usage asynchronously', async () => {
    const req = new Request('https://api.forensicate.ai/', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    await authenticate(req, mockEnv);
    expect(mockEnv.API_TOKENS.put).toHaveBeenCalledWith(
      expect.stringContaining('usage:'),
      expect.stringContaining('lastUsedAt'),
      expect.objectContaining({ expirationTtl: 31536000 })
    );
  });
});

describe('checkIPWhitelist', () => {
  function makeRequest(ip?: string): Request {
    const headers: Record<string, string> = {};
    if (ip) headers['CF-Connecting-IP'] = ip;
    return new Request('https://api.forensicate.ai/', { headers });
  }

  it('allows when no whitelist configured', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: {} };
    expect(checkIPWhitelist(makeRequest('1.2.3.4'), token)).toBe(true);
  });

  it('allows when whitelist is empty', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { ipWhitelist: [] } };
    expect(checkIPWhitelist(makeRequest('1.2.3.4'), token)).toBe(true);
  });

  it('allows matching IP', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { ipWhitelist: ['1.2.3.4'] } };
    expect(checkIPWhitelist(makeRequest('1.2.3.4'), token)).toBe(true);
  });

  it('rejects non-matching IP', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { ipWhitelist: ['1.2.3.4'] } };
    expect(checkIPWhitelist(makeRequest('5.6.7.8'), token)).toBe(false);
  });

  it('rejects when CF-Connecting-IP header is missing', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { ipWhitelist: ['1.2.3.4'] } };
    expect(checkIPWhitelist(makeRequest(), token)).toBe(false);
  });
});

describe('checkDomainWhitelist', () => {
  function makeRequest(origin?: string): Request {
    const headers: Record<string, string> = {};
    if (origin) headers['Origin'] = origin;
    return new Request('https://api.forensicate.ai/', { headers });
  }

  it('allows when no whitelist configured', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: {} };
    expect(checkDomainWhitelist(makeRequest('https://any.com'), token)).toBe(true);
  });

  it('allows matching domain', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['example.com'] } };
    expect(checkDomainWhitelist(makeRequest('https://example.com'), token)).toBe(true);
  });

  it('rejects non-matching domain', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['example.com'] } };
    expect(checkDomainWhitelist(makeRequest('https://evil.com'), token)).toBe(false);
  });

  it('supports wildcard subdomain matching', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['*.example.com'] } };
    expect(checkDomainWhitelist(makeRequest('https://app.example.com'), token)).toBe(true);
  });

  it('wildcard matches base domain', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['*.example.com'] } };
    expect(checkDomainWhitelist(makeRequest('https://example.com'), token)).toBe(true);
  });

  it('prevents wildcard bypass without dot separator', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['*.example.com'] } };
    expect(checkDomainWhitelist(makeRequest('https://evilexample.com'), token)).toBe(false);
  });

  it('rejects missing Origin header', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['example.com'] } };
    expect(checkDomainWhitelist(makeRequest(), token)).toBe(false);
  });

  it('rejects invalid origin URL', () => {
    const token: APIToken = { tokenHash: 'h', tenantId: 't', tier: 'free', createdAt: '', metadata: { domains: ['example.com'] } };
    expect(checkDomainWhitelist(makeRequest('not-a-url'), token)).toBe(false);
  });
});

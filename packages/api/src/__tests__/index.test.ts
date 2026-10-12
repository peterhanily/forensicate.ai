import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { authenticate, checkDomainWhitelist, checkIPWhitelist } from '../auth';
import type { APIToken, Env, TenantMetadata } from '../types';

vi.mock('../auth', () => ({
  authenticate: vi.fn(), checkDomainWhitelist: vi.fn(), checkIPWhitelist: vi.fn(),
}));
vi.mock('../handlers/scan', () => ({ handleScan: vi.fn(() => new Response('{"success":true}')) }));

const tenant = { id: 'example' } as TenantMetadata;
const token = { metadata: { domains: ['app.example'] } } as APIToken;
const rateLimitFetch = vi.fn();
const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
const env = {
  API_VERSION: 'v1', ENVIRONMENT: 'test', CORS_ALLOWED_ORIGINS: 'https://app.example',
  RATE_LIMITER: { idFromName: vi.fn(), get: () => ({ fetch: rateLimitFetch }) },
} as unknown as Env;

const request = (path = '/v1/scan', method = 'POST') => new Request(`https://api.example${path}`, {
  method, headers: { Origin: 'https://app.example' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockResolvedValue({ token, tenant });
  vi.mocked(checkDomainWhitelist).mockReturnValue(true);
  vi.mocked(checkIPWhitelist).mockReturnValue(true);
  rateLimitFetch.mockResolvedValue(Response.json({ allowed: true, tokens: 1, retryAfter: null }));
});

describe('worker response handling', () => {
  it('allows configured browser preflights without authenticating them', async () => {
    const response = await worker.fetch(request('/v1/scan', 'OPTIONS'), env, ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    expect(authenticate).not.toHaveBeenCalled();
    expect(rateLimitFetch).not.toHaveBeenCalled();
  });

  it('denies browser preflights for unconfigured origins', async () => {
    const response = await worker.fetch(request('/v1/scan', 'OPTIONS'), { ...env, CORS_ALLOWED_ORIGINS: '' }, ctx);
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('adds security and cache headers to health and authentication errors', async () => {
    vi.mocked(authenticate).mockResolvedValue(null);
    for (const path of ['/health', '/v1/scan']) {
      const response = await worker.fetch(request(path), env, ctx);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Vary')).toBe('Origin');
    }
  });

  it('preserves Retry-After and CORS on rate-limit responses', async () => {
    rateLimitFetch.mockResolvedValue(Response.json({ allowed: false, tokens: 0, retryAfter: 3 }, { status: 429 }));
    const response = await worker.fetch(request(), env, ctx);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    expect(response.headers.get('X-Rate-Limit-Remaining')).toBe('0');
  });

  it('reports service failure when the limiter is unavailable', async () => {
    rateLimitFetch.mockResolvedValue(new Response('Unavailable', { status: 503 }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(503);
  });

  it('passes the execution context to authentication for background usage writes', async () => {
    await worker.fetch(request(), env, ctx);
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), env, ctx);
  });
});

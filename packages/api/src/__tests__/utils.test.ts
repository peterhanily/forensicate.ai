import { describe, it, expect } from 'vitest';
import { createErrorResponse, validateScanRequest, validateBatchScanRequest, getCORSHeaders, handleCORS } from '../utils';
import type { ErrorResponse } from '../types';

describe('createErrorResponse', () => {
  it('returns JSON response with correct status code', () => {
    const response = createErrorResponse('TEST_ERROR', 'Something went wrong', 400);
    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns correct body structure', async () => {
    const response = createErrorResponse('TEST_ERROR', 'Something went wrong', 400);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'TEST_ERROR',
        message: 'Something went wrong'
      }
    });
  });

  it('includes details when provided', async () => {
    const response = createErrorResponse('TEST_ERROR', 'msg', 400, { extra: 'info' });
    const body = await response.json() as ErrorResponse;
    expect(body.error.details).toEqual({ extra: 'info' });
  });
});

describe('validateScanRequest', () => {
  it('accepts valid request', () => {
    expect(validateScanRequest({ text: 'Hello world' })).toEqual({ valid: true });
  });

  it('accepts request with all optional fields', () => {
    expect(validateScanRequest({
      text: 'Hello',
      confidenceThreshold: 50,
      includePositions: true,
      metadata: { source: 'test' }
    })).toEqual({ valid: true });
  });

  it('rejects null body', () => {
    const result = validateScanRequest(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('object');
  });

  it('rejects non-object body', () => {
    expect(validateScanRequest('string')).toEqual({
      valid: false,
      error: 'Request body must be an object'
    });
  });

  it('rejects missing text field', () => {
    const result = validateScanRequest({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('text');
  });

  it('rejects non-string text', () => {
    const result = validateScanRequest({ text: 123 });
    expect(result.valid).toBe(false);
  });

  it('rejects empty text', () => {
    const result = validateScanRequest({ text: '   ' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects non-number confidenceThreshold', () => {
    const result = validateScanRequest({ text: 'Hello', confidenceThreshold: 'high' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('confidenceThreshold');
  });

  it('rejects confidenceThreshold below 0', () => {
    const result = validateScanRequest({ text: 'Hello', confidenceThreshold: -1 });
    expect(result.valid).toBe(false);
  });

  it('rejects confidenceThreshold above 100', () => {
    const result = validateScanRequest({ text: 'Hello', confidenceThreshold: 101 });
    expect(result.valid).toBe(false);
  });

  it('accepts confidenceThreshold at boundaries', () => {
    expect(validateScanRequest({ text: 'Hello', confidenceThreshold: 0 }).valid).toBe(true);
    expect(validateScanRequest({ text: 'Hello', confidenceThreshold: 100 }).valid).toBe(true);
  });

  it('rejects non-boolean includePositions', () => {
    const result = validateScanRequest({ text: 'Hello', includePositions: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('includePositions');
  });

  it('rejects array metadata', () => {
    const result = validateScanRequest({ text: 'Hello', metadata: [1, 2, 3] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('metadata');
  });

  it('rejects null metadata', () => {
    const result = validateScanRequest({ text: 'Hello', metadata: null });
    expect(result.valid).toBe(false);
  });

  it('rejects oversized metadata (>4KB)', () => {
    const bigMetadata: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      bigMetadata[`key_${i}`] = 'x'.repeat(50);
    }
    const result = validateScanRequest({ text: 'Hello', metadata: bigMetadata });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('size');
  });

  it('rejects metadata with too many keys (>20)', () => {
    const manyKeys: Record<string, string> = {};
    for (let i = 0; i < 21; i++) {
      manyKeys[`k${i}`] = 'v';
    }
    const result = validateScanRequest({ text: 'Hello', metadata: manyKeys });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('key count');
  });
});

describe('validateBatchScanRequest', () => {
  it('accepts valid batch request', () => {
    expect(validateBatchScanRequest({
      prompts: [{ text: 'Hello' }, { text: 'World' }]
    })).toEqual({ valid: true });
  });

  it('accepts batch with optional fields', () => {
    expect(validateBatchScanRequest({
      prompts: [{ id: '1', text: 'Hello' }],
      confidenceThreshold: 50
    })).toEqual({ valid: true });
  });

  it('rejects null body', () => {
    expect(validateBatchScanRequest(null).valid).toBe(false);
  });

  it('rejects missing prompts', () => {
    const result = validateBatchScanRequest({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('prompts');
  });

  it('rejects empty prompts array', () => {
    const result = validateBatchScanRequest({ prompts: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects more than 100 prompts', () => {
    const prompts = Array.from({ length: 101 }, (_, i) => ({ text: `Prompt ${i}` }));
    const result = validateBatchScanRequest({ prompts });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100');
  });

  it('rejects prompt without text', () => {
    const result = validateBatchScanRequest({ prompts: [{ text: '' }] });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid prompt object', () => {
    const result = validateBatchScanRequest({ prompts: [null] });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid confidenceThreshold', () => {
    const result = validateBatchScanRequest({
      prompts: [{ text: 'Hello' }],
      confidenceThreshold: 'high'
    });
    expect(result.valid).toBe(false);
  });
});

describe('getCORSHeaders', () => {
  function makeRequest(origin?: string): Request {
    const headers: Record<string, string> = {};
    if (origin) headers['Origin'] = origin;
    return new Request('https://api.forensicate.ai/v1/scan', { headers });
  }

  it('returns minimal headers for server-to-server requests (no Origin)', () => {
    const headers = getCORSHeaders(makeRequest());
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('returns empty headers when no whitelist configured and origin present', () => {
    const headers = getCORSHeaders(makeRequest('https://evil.com'));
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('returns CORS headers for allowed origin', () => {
    const headers = getCORSHeaders(
      makeRequest('https://forensicate.ai'),
      ['forensicate.ai']
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://forensicate.ai');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Access-Control-Max-Age']).toBe('86400');
  });

  it('rejects disallowed origin', () => {
    const headers = getCORSHeaders(
      makeRequest('https://evil.com'),
      ['forensicate.ai']
    );
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('supports wildcard subdomain matching', () => {
    const headers = getCORSHeaders(
      makeRequest('https://app.forensicate.ai'),
      ['*.forensicate.ai']
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.forensicate.ai');
  });

  it('wildcard matches base domain too', () => {
    const headers = getCORSHeaders(
      makeRequest('https://forensicate.ai'),
      ['*.forensicate.ai']
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://forensicate.ai');
  });

  it('prevents wildcard bypass without dot separator', () => {
    const headers = getCORSHeaders(
      makeRequest('https://evilforensicate.ai'),
      ['*.forensicate.ai']
    );
    expect(Object.keys(headers)).toHaveLength(0);
  });
});

describe('handleCORS', () => {
  function makeRequest(origin?: string): Request {
    const headers: Record<string, string> = { };
    if (origin) headers['Origin'] = origin;
    return new Request('https://api.forensicate.ai/', {
      method: 'OPTIONS',
      headers
    });
  }

  it('returns 204 for server-to-server preflight (no origin)', () => {
    const response = handleCORS(makeRequest());
    expect(response.status).toBe(204);
  });

  it('returns 403 when origin not allowed', () => {
    const response = handleCORS(makeRequest('https://evil.com'));
    expect(response.status).toBe(403);
  });

  it('returns 204 for allowed origin', () => {
    const response = handleCORS(makeRequest('https://forensicate.ai'), ['forensicate.ai']);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://forensicate.ai');
  });
});

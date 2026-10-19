import { describe, expect, it, vi, afterEach } from 'vitest';
import { handleScan } from '../handlers/scan';
import { scanPrompt } from '@forensicate/scanner';
import { readBoundedJson, RequestBodyTooLargeError } from '../utils';
import type { Env, TenantMetadata } from '../types';

vi.mock('@forensicate/scanner', () => ({
  scanPrompt: vi.fn(() => ({ isPositive: false, confidence: 0, matchedRules: [] })),
  getEnabledRules: () => [],
  ruleCategories: [],
}));

const env = { MAX_TEXT_LENGTH: '8' } as Env;
const tenant = {} as TenantMetadata;
const request = (body: unknown, contentType = 'application/json') => new Request('https://api.example/scan', {
  method: 'POST', headers: { 'Content-Type': contentType }, body: JSON.stringify(body),
});

afterEach(() => vi.restoreAllMocks());

describe('scan request limits', () => {
  it('uses the configured text limit', async () => {
    const response = await handleScan(request({ text: 'hello world' }), env, tenant);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'TEXT_TOO_LONG' } });
  });

  it('accepts JSON media types case-insensitively with charset parameters', async () => {
    expect((await handleScan(request({ text: 'hello' }, 'Application/JSON; charset=utf-8'), env, tenant)).status).toBe(200);
  });

  it('rejects media types containing but not equal to application/json', async () => {
    expect((await handleScan(request({ text: 'hello' }, 'application/json-extra'), env, tenant)).status).toBe(415);
  });

  it('bounds the full request body even when text is short', async () => {
    const response = await handleScan(request({ text: 'hello', notes: 'a'.repeat(8300) }), env, tenant);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'REQUEST_TOO_LARGE' } });
  });

  it('does not schedule an ineffective scan timeout', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    expect((await handleScan(request({ text: 'hello' }), env, tenant)).status).toBe(200);
    expect(timer).not.toHaveBeenCalled();
  });

  it('exposes the scanner verdict and passes through the configured threshold', async () => {
    const response = await handleScan(request({ text: 'hello', confidenceThreshold: 80 }), env, tenant);
    expect(await response.json()).toMatchObject({ data: { isPositive: false } });
    expect(scanPrompt).toHaveBeenLastCalledWith('hello', [], 80);
  });
});

describe('bounded JSON reading', () => {
  it('measures UTF-8 bytes without requiring a Content-Length header', async () => {
    await expect(readBoundedJson(request({ text: '🌼' }), 12)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('accepts a body exactly at the byte limit', async () => {
    await expect(readBoundedJson(request({ text: '🌼' }), 15)).resolves.toEqual({ text: '🌼' });
  });
});

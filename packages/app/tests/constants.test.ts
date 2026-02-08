import { describe, it, expect } from 'vitest';
import { APP_NAME, APP_VERSION } from '../src/lib/constants';

describe('constants', () => {
  it('should have a valid APP_NAME', () => {
    expect(APP_NAME).toBe('Forensicate.ai');
    expect(typeof APP_NAME).toBe('string');
    expect(APP_NAME.length).toBeGreaterThan(0);
  });

  it('should have a valid APP_VERSION in semver format', () => {
    expect(APP_VERSION).toBe('0.1.0');
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

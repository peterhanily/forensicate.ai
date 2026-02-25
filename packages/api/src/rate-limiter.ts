// Rate Limiter Durable Object

import type { Env, RateLimiterState, TenantMetadata } from './types';

/**
 * Rate Limiter Durable Object
 * Implements token bucket algorithm for per-tenant rate limiting
 */
export class RateLimiter implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Check if request should be allowed (token bucket algorithm)
   */
  async fetch(request: Request): Promise<Response> {
    try {
      const { tenant } = await request.json<{ tenant: TenantMetadata }>();

      const maxTokens = tenant.rateLimits.burstSize;
      const refillRate = tenant.rateLimits.requestsPerSecond;

      // Get current state
      let limiterState = await this.state.storage.get<RateLimiterState>('state');
      if (!limiterState) {
        limiterState = {
          tokens: maxTokens,
          lastRefill: Date.now()
        };
      }

      // Calculate tokens to add since last refill
      const now = Date.now();
      const timeSinceRefill = (now - limiterState.lastRefill) / 1000; // seconds
      const tokensToAdd = timeSinceRefill * refillRate;

      // Update token count (capped at max)
      limiterState.tokens = Math.min(maxTokens, limiterState.tokens + tokensToAdd);
      limiterState.lastRefill = now;

      // Check if request allowed
      if (limiterState.tokens >= 1) {
        // Allow request, consume token
        limiterState.tokens -= 1;
        await this.state.storage.put('state', limiterState);

        return new Response(JSON.stringify({
          allowed: true,
          tokens: Math.floor(limiterState.tokens),
          retryAfter: null
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Rate limit exceeded
        const retryAfter = Math.ceil((1 - limiterState.tokens) / refillRate);

        return new Response(JSON.stringify({
          allowed: false,
          tokens: 0,
          retryAfter
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString()
          }
        });
      }
    } catch (error) {
      console.error('Rate limiter error:', error);
      return new Response(JSON.stringify({
        allowed: false, // Fail closed — deny on error to prevent bypass
        tokens: 0,
        retryAfter: 5
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '5'
        }
      });
    }
  }

  /**
   * Reset rate limiter state (for testing)
   */
  async alarm(): Promise<void> {
    // Optional: periodic cleanup or reset logic
    await this.state.storage.deleteAll();
  }
}

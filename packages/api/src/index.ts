// Forensicate.ai REST API
// Cloudflare Workers entry point

import type { Env } from './types';
import { authenticate, checkIPWhitelist, checkDomainWhitelist } from './auth';
import { handleScan } from './handlers/scan';
import { createErrorResponse, handleCORS, getCORSHeaders } from './utils';

export { RateLimiter } from './rate-limiter';

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health check (no auth required)
      if (path === '/health' || path === '/') {
        return new Response(JSON.stringify({
          success: true,
          data: {
            status: 'healthy',
            version: env.API_VERSION || 'v1',
            environment: env.ENVIRONMENT || 'production',
            timestamp: new Date().toISOString()
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return handleCORS(request);
      }

      // Authenticate request
      const auth = await authenticate(request, env);
      if (!auth) {
        return createErrorResponse(
          'UNAUTHORIZED',
          'Invalid or missing API token',
          401
        );
      }

      const { token, tenant } = auth;

      // Check IP whitelist
      if (!checkIPWhitelist(request, token)) {
        return createErrorResponse(
          'FORBIDDEN',
          'IP address not whitelisted',
          403
        );
      }

      // Check domain whitelist
      if (!checkDomainWhitelist(request, token)) {
        return createErrorResponse(
          'FORBIDDEN',
          'Domain not whitelisted',
          403
        );
      }

      // Rate limiting
      const rateLimiterId = env.RATE_LIMITER.idFromName(tenant.id);
      const rateLimiter = env.RATE_LIMITER.get(rateLimiterId);

      const rateLimitResponse = await rateLimiter.fetch(
        new Request('https://rate-limiter/', {
          method: 'POST',
          body: JSON.stringify({ tenant })
        })
      );

      const rateLimitResult = await rateLimitResponse.json<{
        allowed: boolean;
        tokens: number;
        retryAfter: number | null;
      }>();

      if (!rateLimitResult.allowed) {
        return createErrorResponse(
          'RATE_LIMIT_EXCEEDED',
          `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.`,
          429,
          { retryAfter: rateLimitResult.retryAfter }
        );
      }

      // Route requests
      let response: Response;

      if (path === '/v1/scan' && request.method === 'POST') {
        response = await handleScan(request, env, tenant);
      } else if (path === '/v1/scan/batch' && request.method === 'POST') {
        response = createErrorResponse(
          'NOT_IMPLEMENTED',
          'Batch scan endpoint not yet implemented',
          501
        );
      } else if (path === '/v1/rules' && request.method === 'GET') {
        response = createErrorResponse(
          'NOT_IMPLEMENTED',
          'Rules endpoint not yet implemented',
          501
        );
      } else if (path === '/v1/usage' && request.method === 'GET') {
        response = createErrorResponse(
          'NOT_IMPLEMENTED',
          'Usage endpoint not yet implemented',
          501
        );
      } else {
        response = createErrorResponse(
          'NOT_FOUND',
          `Endpoint not found: ${request.method} ${path}`,
          404
        );
      }

      // Add CORS headers to response
      const corsHeaders = getCORSHeaders(request, token.metadata?.domains);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      // Add standard headers
      response.headers.set('X-API-Version', env.API_VERSION || 'v1');
      response.headers.set('X-Rate-Limit-Remaining', rateLimitResult.tokens.toString());

      return response;

    } catch (error) {
      console.error('Unhandled error:', error);
      return createErrorResponse(
        'INTERNAL_ERROR',
        'An unexpected error occurred',
        500
      );
    }
  }
};

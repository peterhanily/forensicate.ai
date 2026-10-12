// Forensicate.ai REST API
// Cloudflare Workers entry point

import type { Env } from './types';
import { authenticate, checkIPWhitelist, checkDomainWhitelist } from './auth';
import { handleScan } from './handlers/scan';
import { createErrorResponse, handleCORS, getCORSHeaders, addSecurityHeaders } from './utils';

export { RateLimiter } from './rate-limiter';

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let allowedOrigins = (env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const finalize = (response: Response): Response => {
      for (const [key, value] of Object.entries(getCORSHeaders(request, allowedOrigins))) {
        response.headers.set(key, value);
      }
      response.headers.set('Vary', 'Origin');
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-API-Version', env.API_VERSION || 'v1');
      addSecurityHeaders(response);
      return response;
    };

    const handleRequest = async (): Promise<Response> => {
      try {
        const url = new URL(request.url);
        const path = url.pathname;

        // Preflight has no bearer token; use the explicitly configured browser origins.
        if (request.method === 'OPTIONS') {
          return handleCORS(request, allowedOrigins);
        }

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

        // Authenticate request
        const auth = await authenticate(request, env, ctx);
        if (!auth) {
          return createErrorResponse(
            'UNAUTHORIZED',
            'Invalid or missing API token',
            401
          );
        }

        const { token, tenant } = auth;
        allowedOrigins = token.metadata?.domains || [];

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

        if (!rateLimitResponse.ok && rateLimitResponse.status !== 429) {
          return createErrorResponse('SERVICE_UNAVAILABLE', 'Rate limiting is temporarily unavailable', 503);
        }

        const rateLimitResult = await rateLimitResponse.json<{
          allowed: boolean;
          tokens: number;
          retryAfter: number | null;
        }>();

        if (typeof rateLimitResult.allowed !== 'boolean' ||
            !Number.isFinite(rateLimitResult.tokens) || rateLimitResult.tokens < 0 ||
            (!rateLimitResult.allowed && (!Number.isFinite(rateLimitResult.retryAfter) || rateLimitResult.retryAfter! <= 0))) {
          return createErrorResponse('SERVICE_UNAVAILABLE', 'Rate limiting is temporarily unavailable', 503);
        }

        if (!rateLimitResult.allowed) {
          const response = createErrorResponse(
            'RATE_LIMIT_EXCEEDED',
            `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.`,
            429,
            { retryAfter: rateLimitResult.retryAfter }
          );
          response.headers.set('Retry-After', String(rateLimitResult.retryAfter));
          response.headers.set('X-Rate-Limit-Remaining', '0');
          return response;
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
            'Endpoint not found',
            404
          );
        }

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
    };
    return finalize(await handleRequest());
  }
} satisfies ExportedHandler<Env>;

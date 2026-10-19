// Utility functions

import type { ErrorResponse, ScanRequest, BatchScanRequest } from './types';
import { isOriginAllowed } from './origins';

/**
 * Create standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details
    }
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Validate scan request
 */
export function validateScanRequest(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be an object' };
  }

  const req = body as Partial<ScanRequest>;

  if (!req.text || typeof req.text !== 'string') {
    return { valid: false, error: 'Missing or invalid "text" field (must be string)' };
  }

  if (req.text.trim().length === 0) {
    return { valid: false, error: 'Text field cannot be empty' };
  }

  if (req.confidenceThreshold !== undefined) {
    if (typeof req.confidenceThreshold !== 'number' || !Number.isFinite(req.confidenceThreshold)) {
      return { valid: false, error: 'confidenceThreshold must be a number' };
    }
    if (req.confidenceThreshold < 0 || req.confidenceThreshold > 100) {
      return { valid: false, error: 'confidenceThreshold must be between 0 and 100' };
    }
  }

  if (req.includePositions !== undefined && typeof req.includePositions !== 'boolean') {
    return { valid: false, error: 'includePositions must be a boolean' };
  }

  // Validate metadata size if present
  if (req.metadata !== undefined) {
    if (typeof req.metadata !== 'object' || Array.isArray(req.metadata) || req.metadata === null) {
      return { valid: false, error: 'metadata must be a plain object' };
    }
    const metadataStr = JSON.stringify(req.metadata);
    if (new TextEncoder().encode(metadataStr).byteLength > 4096) {
      return { valid: false, error: 'metadata exceeds maximum size (4KB)' };
    }
    if (Object.keys(req.metadata).length > 20) {
      return { valid: false, error: 'metadata exceeds maximum key count (20)' };
    }
  }

  return { valid: true };
}

/**
 * Validate batch scan request
 */
export function validateBatchScanRequest(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be an object' };
  }

  const req = body as Partial<BatchScanRequest>;

  if (!Array.isArray(req.prompts)) {
    return { valid: false, error: 'Missing or invalid "prompts" field (must be array)' };
  }

  if (req.prompts.length === 0) {
    return { valid: false, error: 'prompts array cannot be empty' };
  }

  if (req.prompts.length > 100) {
    return { valid: false, error: 'prompts array cannot exceed 100 items' };
  }

  for (let i = 0; i < req.prompts.length; i++) {
    const prompt = req.prompts[i];
    if (!prompt || typeof prompt !== 'object') {
      return { valid: false, error: `prompts[${i}] must be an object` };
    }
    if (!prompt.text || typeof prompt.text !== 'string') {
      return { valid: false, error: `prompts[${i}].text must be a non-empty string` };
    }
    if (prompt.text.trim().length === 0) {
      return { valid: false, error: `prompts[${i}].text cannot be empty` };
    }
  }

  if (req.confidenceThreshold !== undefined) {
    if (typeof req.confidenceThreshold !== 'number' || !Number.isFinite(req.confidenceThreshold)) {
      return { valid: false, error: 'confidenceThreshold must be a number' };
    }
    if (req.confidenceThreshold < 0 || req.confidenceThreshold > 100) {
      return { valid: false, error: 'confidenceThreshold must be between 0 and 100' };
    }
  }

  return { valid: true };
}

/**
 * CORS headers based on request origin
 */
export function getCORSHeaders(request: Request, allowedOrigins: string[] = []): Record<string, string> {
  const origin = request.headers.get('Origin');

  // No origin header (server-to-server request) — CORS is irrelevant, return minimal headers
  if (!origin) {
    return {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
  }

  // No whitelist configured — reject browser cross-origin requests by default
  if (allowedOrigins.length === 0) {
    return {};
  }

  // Check if origin is allowed
  const isAllowed = isOriginAllowed(origin, allowedOrigins);

  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Expose-Headers': 'X-API-Version, X-Rate-Limit-Remaining, X-Processing-Time-Ms, Retry-After',
      'Vary': 'Origin'
    };
  }

  // Origin not allowed
  return {};
}

export class RequestBodyTooLargeError extends Error {}

/** Read JSON while bounding bytes received, including requests without Content-Length. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError('Request body exceeds maximum size');
  }
  if (!request.body) throw new SyntaxError('Missing request body');

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError('Request body exceeds maximum size');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Handle CORS preflight request
 */
export function handleCORS(request: Request, allowedOrigins: string[] = []): Response {
  const headers = getCORSHeaders(request, allowedOrigins);

  if (Object.keys(headers).length === 0) {
    return new Response('Origin not allowed', { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers
  });
}

/**
 * Add security headers to API response
 */
export function addSecurityHeaders(response: Response): void {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

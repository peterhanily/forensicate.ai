// Utility functions

import type { ErrorResponse, ScanRequest, BatchScanRequest } from './types';

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
  if (!body || typeof body !== 'object') {
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
    if (typeof req.confidenceThreshold !== 'number') {
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
    if (metadataStr.length > 4096) {
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
  if (!body || typeof body !== 'object') {
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
    if (typeof req.confidenceThreshold !== 'number') {
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
  const isAllowed = allowedOrigins.some(allowed => {
    if (allowed.startsWith('*.')) {
      const baseDomain = allowed.slice(2);
      return origin.endsWith(`.${baseDomain}`) || origin === `https://${baseDomain}`;
    }
    return origin === allowed || origin === `https://${allowed}`;
  });

  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };
  }

  // Origin not allowed
  return {};
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

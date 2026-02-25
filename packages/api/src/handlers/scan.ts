// /v1/scan endpoint handler

import { scanPrompt, getEnabledRules, ruleCategories } from '@forensicate/scanner';
import type { Env, ScanRequest, ScanResponse, TenantMetadata } from '../types';
import { createErrorResponse, validateScanRequest } from '../utils';

const MAX_TEXT_LENGTH = 100000; // 100KB
const SCAN_TIMEOUT_MS = 5000; // 5 seconds

/**
 * POST /v1/scan - Scan a single prompt
 */
export async function handleScan(
  request: Request,
  env: Env,
  tenant: TenantMetadata
): Promise<Response> {
  const startTime = Date.now();

  try {
    // Validate Content-Type
    const contentType = request.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return createErrorResponse('INVALID_CONTENT_TYPE', 'Content-Type must be application/json', 415);
    }

    // Parse request body
    let body: ScanRequest;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse('INVALID_JSON', 'Request body must be valid JSON', 400);
    }

    // Validate request
    const validation = validateScanRequest(body);
    if (!validation.valid) {
      return createErrorResponse('VALIDATION_ERROR', validation.error!, 400);
    }

    const { text, confidenceThreshold = 0, includePositions = false } = body;

    // Check text length
    if (text.length > MAX_TEXT_LENGTH) {
      return createErrorResponse(
        'TEXT_TOO_LONG',
        `Text length ${text.length} exceeds maximum ${MAX_TEXT_LENGTH} characters`,
        413
      );
    }

    // Get enabled rules
    const rules = getEnabledRules();

    // Scan with timeout protection
    const result = await Promise.race<ReturnType<typeof scanPrompt>>([
      // Actual scan
      Promise.resolve(scanPrompt(text, rules, confidenceThreshold)),

      // Timeout
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Scan timeout exceeded')), SCAN_TIMEOUT_MS)
      ) as never
    ]);

    const processingTimeMs = Date.now() - startTime;

    // Calculate risk level from confidence
    const riskLevel: 'low' | 'medium' | 'high' =
      result.confidence >= 70 ? 'high' :
      result.confidence >= 30 ? 'medium' :
      'low';

    // Build rule lookup maps
    const ruleLookup = new Map<string, { category: string; description: string }>();
    for (const category of ruleCategories) {
      for (const rule of category.rules) {
        ruleLookup.set(rule.id, {
          category: category.name,
          description: rule.description
        });
      }
    }

    // Format response
    const response: ScanResponse = {
      success: true,
      data: {
        text: text.substring(0, 1000), // Limit echoed text
        textLength: text.length,
        confidence: result.confidence,
        riskLevel,
        matchCount: result.matchedRules.length,
        matches: result.matchedRules.map(match => {
          const ruleInfo = ruleLookup.get(match.ruleId);
          return {
            ruleId: match.ruleId,
            ruleName: match.ruleName,
            ruleType: match.ruleType,
            category: ruleInfo?.category || 'Unknown',
            severity: match.severity,
            description: ruleInfo?.description || '',
            confidenceImpact: match.confidenceImpact,
            matches: match.matches?.slice(0, 5), // Limit matched strings
            positions: includePositions ? match.positions?.slice(0, 10) : undefined
          };
        }),
        scannedAt: new Date().toISOString(),
        processingTimeMs
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Processing-Time-Ms': processingTimeMs.toString()
      }
    });

  } catch (error) {
    console.error('Scan error:', error);

    // User-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return createErrorResponse(
          'SCAN_TIMEOUT',
          'Scan took too long to complete. Try with shorter or simpler text.',
          504
        );
      }
      if (error.message.includes('memory')) {
        return createErrorResponse(
          'OUT_OF_MEMORY',
          'Not enough memory to scan this text. Try with shorter text.',
          507
        );
      }
    }

    return createErrorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred during scanning',
      500
    );
  }
}

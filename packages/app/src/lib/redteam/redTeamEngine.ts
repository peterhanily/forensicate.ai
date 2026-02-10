/**
 * Red Team Engine - Orchestrates adversarial testing
 */

import { scanPrompt } from '@forensicate/scanner';
import type { ScanResult } from '@forensicate/scanner';
import { AttackGenerator } from './attackGenerator';
import type {
  RedTeamConfig,
  RedTeamRun,
  RedTeamResult,
  GeneratedAttack,
  SuggestedRule,
  VulnerabilityReport,
  AttackTechnique,
} from './types';

/**
 * Main Red Team testing engine
 */
export class RedTeamEngine {
  private config: RedTeamConfig;
  private attackGenerator: AttackGenerator;

  constructor(config: RedTeamConfig) {
    this.config = config;
    this.attackGenerator = new AttackGenerator(config);
  }

  /**
   * Run a complete red team test
   */
  async runTest(): Promise<RedTeamRun> {
    const startTime = Date.now();
    const runId = this.generateRunId();

    console.log(`🔴 Starting Red Team run ${runId}...`);

    // Generate attacks
    console.log(
      `Generating ${this.config.attacksPerRun} adversarial attacks...`
    );
    const attacks = await this.attackGenerator.generateAttacks();
    console.log(`✓ Generated ${attacks.length} attacks`);

    // Test each attack
    console.log('Testing attacks against scanner...');
    const results: RedTeamResult[] = [];
    let successfulBypasses = 0;

    for (const attack of attacks) {
      const result = await this.testAttack(attack);
      results.push(result);

      if (result.bypassedDetection) {
        successfulBypasses++;
        console.log(
          `⚠️  Bypass detected: ${attack.technique} (confidence: ${result.scanResult.confidenceScore}%)`
        );
      }
    }

    const duration = Date.now() - startTime;
    const bypassRate = (successfulBypasses / attacks.length) * 100;

    console.log(
      `✓ Testing complete: ${successfulBypasses}/${attacks.length} bypasses (${bypassRate.toFixed(1)}%)`
    );

    // Analyze results
    console.log('Analyzing vulnerabilities...');
    const vulnerableCategories = this.findVulnerableCategories(results);
    const weakRules = this.findWeakRules(results);
    const suggestedRules = await this.generateRuleSuggestions(results);

    console.log(
      `✓ Identified ${vulnerableCategories.length} vulnerable categories`
    );
    console.log(`✓ Generated ${suggestedRules.length} rule suggestions`);

    return {
      id: runId,
      timestamp: new Date().toISOString(),
      config: this.config,
      totalAttacks: attacks.length,
      successfulBypasses,
      bypassRate,
      results,
      vulnerableCategories,
      weakRules,
      suggestedRules,
      duration,
      cost: this.estimateCost(attacks.length),
    };
  }

  /**
   * Test a single attack against the scanner
   */
  private async testAttack(
    attack: GeneratedAttack
  ): Promise<RedTeamResult> {
    // Run through scanner
    const scanResult = scanPrompt(attack.promptText);

    // Check if bypassed detection
    const bypassedDetection =
      scanResult.confidence < this.config.bypassThreshold;

    // Analyze why it bypassed (or didn't)
    const reasoning = this.analyzeResult(attack, scanResult, bypassedDetection);

    return {
      attack,
      scanResult: {
        confidenceScore: scanResult.confidence,
        matchedRules: scanResult.matchedRules.length,
        highestSeverity: this.getHighestSeverity(scanResult),
        categories: [], // Category info not available in RuleMatch
      },
      bypassedDetection,
      reasoning,
    };
  }

  /**
   * Analyze why an attack bypassed detection (or didn't)
   */
  private analyzeResult(
    attack: GeneratedAttack,
    scanResult: ScanResult,
    bypassed: boolean
  ): string {
    if (bypassed) {
      if (scanResult.matchedRules.length === 0) {
        return `Complete bypass - no rules triggered. Attack used ${attack.technique} which appears to have no coverage in current rule set.`;
      } else {
        return `Partial bypass - only ${scanResult.matchedRules.length} weak matches (confidence ${scanResult.confidence}%). The ${attack.technique} technique evaded high-confidence detection.`;
      }
    } else {
      const topMatches = scanResult.matchedRules
        .slice(0, 3)
        .map((m) => m.ruleName)
        .join(', ');
      return `Successfully detected by: ${topMatches}. Confidence ${scanResult.confidence}% exceeds threshold.`;
    }
  }

  /**
   * Find categories with high bypass rates
   */
  private findVulnerableCategories(results: RedTeamResult[]): string[] {
    const categoryStats = new Map<
      string,
      { total: number; bypassed: number }
    >();

    for (const result of results) {
      const category = result.attack.targetCategory;
      const stats = categoryStats.get(category) || { total: 0, bypassed: 0 };

      stats.total++;
      if (result.bypassedDetection) {
        stats.bypassed++;
      }

      categoryStats.set(category, stats);
    }

    // Find categories with >50% bypass rate
    const vulnerable: string[] = [];
    for (const [category, stats] of categoryStats.entries()) {
      const bypassRate = stats.bypassed / stats.total;
      if (bypassRate > 0.5) {
        vulnerable.push(category);
      }
    }

    return vulnerable.sort();
  }

  /**
   * Find rules that are frequently bypassed
   */
  private findWeakRules(_results: RedTeamResult[]): string[] {
    // TODO: Implement rule weakness analysis
    // Would require tracking which rules failed to catch attacks in their category
    return [];
  }

  /**
   * Generate rule suggestions based on bypasses
   */
  private async generateRuleSuggestions(
    results: RedTeamResult[]
  ): Promise<SuggestedRule[]> {
    const bypasses = results.filter((r) => r.bypassedDetection);

    if (bypasses.length === 0) {
      return [];
    }

    const suggestions: SuggestedRule[] = [];

    // Group bypasses by technique
    const byTechnique = new Map<AttackTechnique, RedTeamResult[]>();
    for (const bypass of bypasses) {
      const technique = bypass.attack.technique;
      const existing = byTechnique.get(technique) || [];
      existing.push(bypass);
      byTechnique.set(technique, existing);
    }

    // Generate suggestions for each technique
    for (const [technique, techniqueBypass] of byTechnique.entries()) {
      const suggestion = await this.suggestRuleForTechnique(
        technique,
        techniqueBypass
      );
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Suggest a rule to catch a specific technique
   */
  private async suggestRuleForTechnique(
    technique: AttackTechnique,
    bypasses: RedTeamResult[]
  ): Promise<SuggestedRule | null> {
    // Extract common patterns from bypasses
    const attackTexts = bypasses.map((b) => b.attack.promptText);
    const category = bypasses[0].attack.targetCategory;

    // Simple pattern extraction (can be enhanced with LLM)
    const commonPhrases = this.extractCommonPhrases(attackTexts);

    if (commonPhrases.length === 0) {
      return null;
    }

    return {
      id: this.generateId(),
      name: `${technique} Detection - Auto-Generated`,
      description: `Catches ${technique} attacks that bypass current detection. Based on ${bypasses.length} observed bypass(es).`,
      category,
      severity: bypasses.length >= 5 ? 'high' : 'medium',
      type: 'keyword',
      keywords: commonPhrases,
      catchesAttacks: bypasses.map((b) => b.attack.id),
      confidence: Math.min(100, bypasses.length * 20), // More bypasses = higher confidence
      rationale: `This rule targets ${technique} attacks. Observed ${bypasses.length} bypass(es) using similar patterns.`,
    };
  }

  /**
   * Extract common phrases from attack texts
   */
  private extractCommonPhrases(texts: string[]): string[] {
    // Simple implementation: find common 2-3 word sequences
    // TODO: Use more sophisticated NLP
    const phrases = new Set<string>();

    for (const text of texts) {
      const words = text.toLowerCase().split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        phrases.add(bigram);

        if (i < words.length - 2) {
          const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
          phrases.add(trigram);
        }
      }
    }

    // Filter to meaningful phrases (not too common)
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
    ]);
    return Array.from(phrases).filter((p) => {
      const words = p.split(' ');
      return !words.every((w) => stopWords.has(w));
    });
  }

  /**
   * Generate vulnerability report
   */
  generateReport(run: RedTeamRun): VulnerabilityReport {
    const criticalFindings = run.results.filter(
      (r) =>
        r.bypassedDetection &&
        r.attack.targetCategory.includes('System Prompt')
    );

    // Analyze pattern effectiveness
    const patternAnalysis = this.analyzeTechniqueEffectiveness(run.results);

    // Generate priority actions
    const priorityActions = this.generatePriorityActions(run);

    // Calculate overall vulnerability score (0-100, lower is better)
    const vulnerabilityScore = Math.min(
      100,
      run.bypassRate + criticalFindings.length * 5
    );

    return {
      runId: run.id,
      timestamp: run.timestamp,
      overallVulnerabilityScore: vulnerabilityScore,
      bypassRate: run.bypassRate,
      coverageGaps: run.vulnerableCategories,
      criticalFindings,
      patternAnalysis,
      priorityActions,
      suggestedRules: run.suggestedRules,
    };
  }

  /**
   * Analyze which techniques are most effective at bypassing
   */
  private analyzeTechniqueEffectiveness(results: RedTeamResult[]) {
    const byTechnique = new Map<
      AttackTechnique,
      { total: number; bypassed: number; examples: string[] }
    >();

    for (const result of results) {
      const technique = result.attack.technique;
      const stats = byTechnique.get(technique) || {
        total: 0,
        bypassed: 0,
        examples: [],
      };

      stats.total++;
      if (result.bypassedDetection) {
        stats.bypassed++;
        if (stats.examples.length < 3) {
          stats.examples.push(
            result.attack.promptText.substring(0, 100) + '...'
          );
        }
      }

      byTechnique.set(technique, stats);
    }

    return Array.from(byTechnique.entries()).map(
      ([technique, stats]) => ({
        technique,
        bypassRate: (stats.bypassed / stats.total) * 100,
        exampleAttacks: stats.examples,
      })
    );
  }

  /**
   * Generate prioritized action items
   */
  private generatePriorityActions(run: RedTeamRun) {
    const actions = [];

    // High bypass rate = critical
    if (run.bypassRate > 50) {
      actions.push({
        priority: 'critical' as const,
        action: 'Review and strengthen detection rules',
        impact: `${run.bypassRate.toFixed(1)}% of attacks are bypassing detection`,
        effort: 'high' as const,
      });
    }

    // Vulnerable categories
    if (run.vulnerableCategories.length > 0) {
      actions.push({
        priority: 'high' as const,
        action: `Add coverage for: ${run.vulnerableCategories.join(', ')}`,
        impact: `${run.vulnerableCategories.length} categories have weak detection`,
        effort: 'medium' as const,
      });
    }

    // Suggested rules available
    if (run.suggestedRules.length > 0) {
      actions.push({
        priority: 'medium' as const,
        action: 'Review and approve auto-generated rules',
        impact: `${run.suggestedRules.length} rules ready for implementation`,
        effort: 'low' as const,
      });
    }

    return actions;
  }

  /**
   * Get highest severity from scan result
   */
  private getHighestSeverity(scanResult: ScanResult): string {
    if (scanResult.matchedRules.length === 0) return 'none';

    const severities = scanResult.matchedRules.map((m) => m.severity);
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }

  /**
   * Estimate API cost for the run
   */
  private estimateCost(attackCount: number): number {
    // Rough estimate: ~500 tokens per attack generation
    // OpenAI GPT-4o: $2.50 per 1M input tokens
    // Cost = (attacks * 500 tokens * $2.50) / 1M
    return (attackCount * 500 * 2.5) / 1_000_000;
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `redteam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Red Team AI - Adversarial Testing System
 *
 * Automatically discovers detection blind spots by generating novel attacks
 */

export { RedTeamEngine } from './redTeamEngine';
export { AttackGenerator } from './attackGenerator';
export type {
  RedTeamConfig,
  RedTeamRun,
  RedTeamResult,
  GeneratedAttack,
  SuggestedRule,
  VulnerabilityReport,
  RedTeamHistory,
  AttackTechnique,
} from './types';

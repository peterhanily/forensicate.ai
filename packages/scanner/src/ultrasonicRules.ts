// Ultrasonic voice command injection detection rules
// These define the rule metadata for ultrasonic attack detection.
// The actual analysis engine (Web Audio API) lives in the app package
// since it requires browser APIs not available in Node/CLI contexts.

import type { DetectionRule, RuleCategory } from './types.js';

export const ultrasonicRules: DetectionRule[] = [
  {
    id: 'us-energy-ratio',
    name: 'Ultrasonic Energy Ratio',
    description: 'High energy detected in ultrasonic band (18–24 kHz) relative to speech band — consistent with DolphinAttack, NUIT, or SurfingAttack carrier modulation',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0051', 'AML.T0051.001'],
    euAiActRisk: 'high',
  },
  {
    id: 'us-narrowband-peak',
    name: 'Ultrasonic Tonal Carrier',
    description: 'Sustained narrowband peak above 18 kHz — indicates a tonal carrier wave used for amplitude-modulated voice command injection',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0051', 'AML.T0051.001'],
    euAiActRisk: 'high',
  },
  {
    id: 'us-am-demodulation',
    name: 'AM-Demodulated Speech Detected',
    description: 'Envelope extraction of ultrasonic content reveals speech-like features — strong indicator of a hidden voice command embedded via amplitude modulation',
    type: 'heuristic',
    severity: 'critical',
    enabled: true,
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01', 'ASI02'],
    killChain: ['initial-access', 'command-and-control'],
    mitreAtlas: ['AML.T0051', 'AML.T0051.001'],
    euAiActRisk: 'high',
  },
  {
    id: 'us-sample-rate-warning',
    name: 'Insufficient Sample Rate',
    description: 'Audio sample rate is too low to capture ultrasonic content — attacks above the Nyquist frequency cannot be detected in this file',
    type: 'heuristic',
    severity: 'low',
    enabled: true,
    owaspLlm: ['LLM01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0051'],
  },
  {
    id: 'us-codec-truncation',
    name: 'Lossy Codec Frequency Truncation',
    description: 'Lossy audio codec (MP3, AAC, OGG) strips frequencies above ~16–18 kHz — ultrasonic attack evidence may have been removed during compression',
    type: 'heuristic',
    severity: 'medium',
    enabled: true,
    owaspLlm: ['LLM01'],
    killChain: ['initial-access'],
    mitreAtlas: ['AML.T0051'],
  },
];

export const ultrasonicRuleCategory: RuleCategory = {
  id: 'ultrasonic',
  name: 'Ultrasonic Voice Command Injection',
  description: 'Detects inaudible ultrasonic voice commands targeting voice assistants (DolphinAttack, NUIT, SurfingAttack)',
  rules: ultrasonicRules,
  source: 'Zhang et al. "DolphinAttack" (CCS 2017); Xia et al. "NUIT" (USENIX 2023); Yan et al. "SurfingAttack" (NDSS 2020)',
};

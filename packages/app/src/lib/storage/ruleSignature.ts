import type { DetectionRule } from '@forensicate/scanner';

// Stable migration identifiers, not security signatures. Preferences and executable
// functions are excluded: enabled/weight are user choices, and code comes from the app.
export function ruleSignature(rule: DetectionRule): string {
  const fields = Object.entries(rule)
    .filter(([key, value]) => key !== 'enabled' && key !== 'weight'
      && value !== undefined && typeof value !== 'function')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return fingerprint(JSON.stringify(fields));
}

export function fingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return [first, second].map(part => (part >>> 0).toString(16).padStart(8, '0')).join('');
}

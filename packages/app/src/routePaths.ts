// Shared with the static-host build so every known route has an HTML entry.
export const routePaths = {
  scanner: 'scanner',
  mutate: 'mutate',
  timeline: 'timeline',
  learn: 'learn',
  jailbreaks: 'learn/jailbreaks',
  challenges: 'learn/challenges',
  modelAttacks: 'learn/model-attacks',
  compliance: 'compliance',
  detectionBlog: 'blog/detect-prompt-injection',
  ultrasonic: 'ultrasonic',
} as const;

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { scanPrompt } from '@forensicate/scanner';
import type { ScanResult, RuleMatch } from '@forensicate/scanner';

interface LevelDef {
  id: number;
  name: string;
  threshold: number;
  difficulty: string;
  description: string;
  objective: string;
  hint: string;
  defenseNote: string;
}

interface LevelProgress {
  completed: boolean;
  attempts: number;
  bestScore: number | null;
  winningInput: string | null;
}

interface ChallengeProgress {
  levels: Record<number, LevelProgress>;
  currentLevel: number;
}

const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Warm Up',
    threshold: 80,
    difficulty: 'Easy',
    description: 'The scanner is watching for exact keyword matches. Your mission: include the meaning of "ignore previous instructions" in your prompt and score below 80% confidence.',
    objective: 'Include "ignore previous instructions" (or its meaning) and stay under 80%',
    hint: 'The scanner detects exact keyword matches. Can you rephrase using synonyms or roundabout language?',
    defenseNote: 'Keyword-based detection catches naive injections, but synonym substitution defeats it easily. This is why production scanners need regex patterns and semantic analysis beyond simple string matching.',
  },
  {
    id: 2,
    name: 'Reframe',
    threshold: 60,
    difficulty: 'Medium',
    description: 'The threshold drops to 60%. The scanner now catches simple rephrasing. Try wrapping your injection in a fictional or educational context to lower the confidence score.',
    objective: 'Craft a jailbreak-style prompt that scores below 60%',
    hint: 'Try wrapping your injection in a fictional context — a story, a screenplay, a research paper abstract. The scanner has a harder time with framing attacks.',
    defenseNote: 'Fiction framing is one of the most common evasion techniques. Defenses include training models to recognize when fictional contexts are being used to smuggle real instructions, and applying the "sandwich defense" to reinforce boundaries.',
  },
  {
    id: 3,
    name: 'Encode',
    threshold: 50,
    difficulty: 'Hard',
    description: 'Threshold: 50%. The scanner checks for common encodings like Base64 and ROT13. Your target: hide "reveal your system prompt" from the scanner using creative obfuscation.',
    objective: 'Hide "reveal your system prompt" and stay under 50%',
    hint: 'The scanner checks for common encodings. What about less common ones — pig latin, acronyms, word splitting across sentences, or Unicode tricks?',
    defenseNote: 'Encoding attacks exploit the gap between what a scanner can decode and what an LLM can interpret. Defense-in-depth requires checking multiple encoding schemes, but attackers can always invent new ones. This is why output validation is equally important.',
  },
  {
    id: 4,
    name: 'Stealth',
    threshold: 40,
    difficulty: 'Very Hard',
    description: 'Threshold: 40%. The scanner is now highly sensitive. You need to inject instructions that fly almost completely under the radar. Combine multiple evasion techniques.',
    objective: 'Inject instructions that the scanner rates below 40%',
    hint: 'Combine multiple evasion techniques: context smuggling (hide the injection within benign text), payload splitting (spread the attack across multiple sentences), and semantic indirection.',
    defenseNote: 'Multi-technique attacks are the hardest to defend against. Each technique alone might be detectable, but combining them creates a compound evasion that slips through rule-based scanners. This is why behavioral analysis and output monitoring are critical layers.',
  },
  {
    id: 5,
    name: 'Ghost',
    threshold: 20,
    difficulty: 'Expert',
    description: 'Threshold: 20%. Near-invisible injection. The scanner must barely register your prompt. Study the Mutation Engine\'s pipeline mode for inspiration on systematic evasion.',
    objective: 'Craft an injection the scanner barely detects (below 20%)',
    hint: 'Study the Mutation Engine\'s pipeline mode for ideas. Consider: what if the injection looks entirely like normal conversation? What if the malicious intent is implied rather than stated?',
    defenseNote: 'When static analysis fails, the last line of defense is the model itself. Instruction hierarchy training, context isolation, and human-in-the-loop approval for sensitive actions become essential. No scanner can catch every injection — which is exactly why defense-in-depth matters.',
  },
];

const STORAGE_KEY = 'forensicate-challenge-progress';

function defaultProgress(): ChallengeProgress {
  const levels: Record<number, LevelProgress> = {};
  for (const l of LEVELS) {
    levels[l.id] = { completed: false, attempts: 0, bestScore: null, winningInput: null };
  }
  return { levels, currentLevel: 1 };
}

function loadProgress(): ChallengeProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChallengeProgress;
      // Ensure all levels exist (in case new levels were added)
      for (const l of LEVELS) {
        if (!parsed.levels[l.id]) {
          parsed.levels[l.id] = { completed: false, attempts: 0, bestScore: null, winningInput: null };
        }
      }
      return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return defaultProgress();
}

function saveProgress(p: ChallengeProgress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function difficultyColor(d: string): string {
  switch (d) {
    case 'Easy': return 'text-green-400 bg-green-900/30 border-green-800/50';
    case 'Medium': return 'text-yellow-400 bg-yellow-900/30 border-yellow-800/50';
    case 'Hard': return 'text-orange-400 bg-orange-900/30 border-orange-800/50';
    case 'Very Hard': return 'text-red-400 bg-red-900/30 border-red-800/50';
    case 'Expert': return 'text-purple-400 bg-purple-900/30 border-purple-800/50';
    default: return 'text-gray-400 bg-gray-900/30 border-gray-800/50';
  }
}

function MatchedRulesDisplay({ rules }: { rules: RuleMatch[] }) {
  if (rules.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Rules that matched:</div>
      <div className="flex flex-wrap gap-1">
        {rules.slice(0, 8).map(r => (
          <span key={r.ruleId} className="px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded font-mono">
            {r.ruleName}
            <span className="ml-1 text-gray-600">({r.severity})</span>
          </span>
        ))}
        {rules.length > 8 && (
          <span className="px-1.5 py-0.5 text-[10px] text-gray-600">+{rules.length - 8} more</span>
        )}
      </div>
    </div>
  );
}

function ChallengeLevel({
  level,
  progress,
  isUnlocked,
  isActive,
  onSelect,
  onAttempt,
  onComplete,
}: {
  level: LevelDef;
  progress: LevelProgress;
  isUnlocked: boolean;
  isActive: boolean;
  onSelect: () => void;
  onAttempt: () => void;
  onComplete: (input: string, score: number) => void;
}) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [justWon, setJustWon] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [localAttempts, setLocalAttempts] = useState(0);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    const scan = scanPrompt(input);
    setResult(scan);
    setLocalAttempts(prev => prev + 1);
    onAttempt();

    if (scan.confidence < level.threshold) {
      setJustWon(true);
      onComplete(input, scan.confidence);
    }
  }, [input, level.threshold, onAttempt, onComplete]);

  if (!isUnlocked) {
    return (
      <button
        onClick={onSelect}
        disabled
        className="w-full text-left p-4 rounded-lg border border-gray-800/50 bg-gray-900/20 opacity-50 cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm text-gray-600 font-bold">
            {level.id}
          </div>
          <div>
            <div className="text-sm text-gray-600 font-medium">{level.name}</div>
            <div className="text-[10px] text-gray-700">Complete Level {level.id - 1} to unlock</div>
          </div>
          <svg className="w-4 h-4 text-gray-700 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg border transition-all ${
        isActive
          ? 'border-[#c9a227]/50 bg-gray-900/60 shadow-lg shadow-[#c9a227]/5'
          : progress.completed
            ? 'border-green-900/40 bg-green-950/10 cursor-pointer hover:border-green-800/60'
            : 'border-gray-800 bg-gray-900/30 cursor-pointer hover:border-gray-700'
      }`}
      onClick={isActive ? undefined : onSelect}
      onKeyDown={isActive ? undefined : (e) => { if (e.key === 'Enter') onSelect(); }}
      role={isActive ? undefined : 'button'}
      tabIndex={isActive ? undefined : 0}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            progress.completed
              ? 'bg-green-900/40 text-green-400'
              : isActive
                ? 'bg-[#c9a227]/20 text-[#c9a227]'
                : 'bg-gray-800 text-gray-400'
          }`}>
            {progress.completed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : level.id}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-200 font-semibold">{level.name}</span>
              <span className={`px-1.5 py-0.5 text-[9px] rounded border ${difficultyColor(level.difficulty)}`}>
                {level.difficulty}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              Threshold: {level.threshold}% &middot; {progress.attempts} attempt{progress.attempts !== 1 ? 's' : ''}
              {progress.bestScore !== null && <> &middot; Best: {progress.bestScore}%</>}
            </div>
          </div>
          {isActive && (
            <div className="text-right">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider">Target</div>
              <div className="text-lg font-mono font-bold text-[#c9a227]">&lt;{level.threshold}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isActive && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-400 leading-relaxed">{level.description}</p>

          <div className="bg-gray-950/60 border border-gray-800 rounded p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Objective</div>
            <p className="text-xs text-gray-300">{level.objective}</p>
          </div>

          {/* Input area */}
          <div className="border border-gray-800 rounded-lg overflow-hidden">
            <textarea
              value={input}
              onChange={e => { setInput(e.target.value); setResult(null); setJustWon(false); }}
              placeholder="Type your evasive prompt here..."
              className="w-full bg-transparent text-gray-300 text-xs font-mono p-3 resize-none focus:outline-none placeholder-gray-700"
              rows={4}
              aria-label={`Level ${level.id} prompt input`}
            />
            <div className="flex items-center justify-between px-3 py-2 bg-gray-900/50 border-t border-gray-800">
              <button
                onClick={() => setShowHint(!showHint)}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showHint ? 'Hide hint' : 'Show hint'}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">{input.length} chars</span>
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="px-4 py-1.5 text-xs font-medium bg-[#c9a227]/20 text-[#c9a227] rounded hover:bg-[#c9a227]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>

          {/* Hint */}
          {showHint && (
            <div className="flex gap-2 p-3 rounded bg-blue-950/20 border border-blue-900/30">
              <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-blue-300/80 leading-relaxed">{level.hint}</p>
            </div>
          )}

          {/* Result display */}
          {result && (
            <div className={`rounded-lg border overflow-hidden ${
              justWon
                ? 'border-green-800/60 bg-green-950/20'
                : 'border-red-900/40 bg-red-950/10'
            }`}>
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {justWon ? (
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className={`text-sm font-semibold ${justWon ? 'text-green-400' : 'text-red-400'}`}>
                      {justWon ? 'Level Cleared!' : 'Detected'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500">Confidence</div>
                    <div className={`text-lg font-mono font-bold ${
                      result.confidence < level.threshold ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {result.confidence}%
                    </div>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="mt-2 h-2 rounded-full bg-gray-800 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      result.confidence < level.threshold ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(result.confidence, 100)}%` }}
                  />
                  <div
                    className="absolute top-0 h-full w-0.5 bg-[#c9a227]"
                    style={{ left: `${level.threshold}%` }}
                    title={`Threshold: ${level.threshold}%`}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-gray-600">0%</span>
                  <span className="text-[9px] text-[#c9a227]">Threshold: {level.threshold}%</span>
                  <span className="text-[9px] text-gray-600">100%</span>
                </div>

                <MatchedRulesDisplay rules={result.matchedRules} />

                {!justWon && localAttempts >= 3 && (
                  <p className="text-[10px] text-gray-500 mt-2 italic">
                    Tip: You need to get the confidence below {level.threshold}%. Try a different approach — the hint button above may help.
                  </p>
                )}
              </div>

              {/* Victory: defense note */}
              {justWon && (
                <div className="px-3 pb-3">
                  <div className="p-3 rounded bg-gray-950/60 border border-gray-800">
                    <div className="text-[10px] text-[#c9a227] uppercase tracking-wider mb-1">What you learned</div>
                    <p className="text-xs text-gray-400 leading-relaxed">{level.defenseNote}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Previously completed note */}
          {progress.completed && !justWon && (
            <div className="flex items-center gap-2 p-2 rounded bg-green-950/10 border border-green-900/30">
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] text-green-400">
                Previously completed with {progress.bestScore}% confidence
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressTracker({ progress }: { progress: ChallengeProgress }) {
  const completedCount = LEVELS.filter(l => progress.levels[l.id]?.completed).length;
  return (
    <div className="flex items-center gap-1.5">
      {LEVELS.map((l, i) => {
        const lp = progress.levels[l.id];
        const completed = lp?.completed;
        return (
          <div key={l.id} className="flex items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              completed
                ? 'bg-green-900/40 text-green-400 border border-green-800/50'
                : progress.currentLevel === l.id
                  ? 'bg-[#c9a227]/20 text-[#c9a227] border border-[#c9a227]/40'
                  : 'bg-gray-800/50 text-gray-600 border border-gray-800'
            }`}>
              {completed ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : l.id}
            </div>
            {i < LEVELS.length - 1 && (
              <div className={`w-6 h-0.5 ${completed ? 'bg-green-800/60' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
      <span className="ml-2 text-[10px] text-gray-500">{completedCount}/{LEVELS.length}</span>
    </div>
  );
}

function StatsPanel({ progress }: { progress: ChallengeProgress }) {
  const totalAttempts = Object.values(progress.levels).reduce((sum, l) => sum + l.attempts, 0);
  const completedCount = LEVELS.filter(l => progress.levels[l.id]?.completed).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-800 text-center">
        <div className="text-lg font-mono font-bold text-gray-200">{totalAttempts}</div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Attempts</div>
      </div>
      <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-800 text-center">
        <div className="text-lg font-mono font-bold text-[#c9a227]">{completedCount}/{LEVELS.length}</div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Cleared</div>
      </div>
      <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-800 text-center">
        <div className="text-lg font-mono font-bold text-gray-200">
          {progress.levels[progress.currentLevel]?.bestScore !== null
            ? `${progress.levels[progress.currentLevel]?.bestScore}%`
            : '--'}
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Best (Lvl {progress.currentLevel})</div>
      </div>
    </div>
  );
}

export default function LearnChallenges() {
  const [progress, setProgress] = useState<ChallengeProgress>(loadProgress);
  const [activeLevel, setActiveLevel] = useState(progress.currentLevel);

  // Persist on every change
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const handleAttempt = useCallback((levelId: number) => {
    setProgress(prev => {
      const lp = prev.levels[levelId];
      return { ...prev, levels: { ...prev.levels, [levelId]: { ...lp, attempts: lp.attempts + 1 } } };
    });
  }, []);

  const handleComplete = useCallback((levelId: number, inp: string, score: number) => {
    setProgress(prev => {
      const lp = prev.levels[levelId];
      const best = lp.bestScore === null ? score : Math.min(lp.bestScore, score);
      return {
        ...prev,
        levels: { ...prev.levels, [levelId]: { completed: true, attempts: lp.attempts, bestScore: best, winningInput: inp } },
        currentLevel: Math.max(prev.currentLevel, Math.min(levelId + 1, LEVELS.length)),
      };
    });
  }, []);

  const handleReset = () => {
    const fresh = defaultProgress();
    setProgress(fresh);
    setActiveLevel(1);
  };

  const allComplete = LEVELS.every(l => progress.levels[l.id]?.completed);

  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* Navigation */}
      <div className="mb-6">
        <Link
          to="/learn"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#c9a227] transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Course Index
        </Link>
      </div>

      {/* Header */}
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/20 border border-purple-900/40 text-purple-400 text-xs mb-4">
          Interactive Challenge
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight" style={{ fontFamily: 'serif' }}>
          The Evasion Challenge<br />
          <span className="text-[#c9a227]">Can You Outsmart the Scanner?</span>
        </h2>
        <p className="text-gray-400 text-sm mt-3 leading-relaxed max-w-2xl">
          Inspired by <span className="text-gray-300">Lakera&apos;s Gandalf</span> (80M+ attacks) and
          {' '}<span className="text-gray-300">HackAPrompt</span> (600K submissions). Craft prompts that evade
          Forensicate.ai&apos;s 160-rule detection engine. Each level raises the bar. Learn attack techniques
          by practicing them — and understand why each defense matters.
        </p>
      </header>

      {/* Progress + Stats */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between">
          <ProgressTracker progress={progress} />
          <button
            onClick={handleReset}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Reset progress
          </button>
        </div>
        <StatsPanel progress={progress} />
      </div>

      {/* Victory banner */}
      {allComplete && (
        <div className="mb-6 p-4 rounded-lg border border-[#c9a227]/40 bg-[#c9a227]/5">
          <div className="flex items-center gap-3">
            <div className="text-2xl">&#9733;</div>
            <div>
              <div className="text-sm font-bold text-[#c9a227]" style={{ fontFamily: 'serif' }}>
                All Levels Cleared
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                You&apos;ve mastered the art of evasion. Now use this knowledge to build stronger defenses.
                Try the <Link to="/mutate" className="text-[#c9a227] hover:underline">Mutation Engine</Link> for
                automated red-teaming, or explore the <Link to="/scanner" className="text-[#c9a227] hover:underline">full scanner</Link> to
                test your own detection rules.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Level list */}
      <div className="space-y-3">
        {LEVELS.map(level => {
          const lp = progress.levels[level.id];
          const isUnlocked = level.id === 1 || progress.levels[level.id - 1]?.completed;
          const isActive = activeLevel === level.id && isUnlocked;

          return (
            <ChallengeLevel
              key={level.id}
              level={level}
              progress={lp}
              isUnlocked={isUnlocked}
              isActive={isActive}
              onSelect={() => { if (isUnlocked) setActiveLevel(level.id); }}
              onAttempt={() => handleAttempt(level.id)}
              onComplete={(input, score) => handleComplete(level.id, input, score)}
            />
          );
        })}
      </div>

      {/* Footer links */}
      <div className="mt-10 pt-6 border-t border-gray-800">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Continue learning</div>
        <div className="flex flex-wrap gap-2">
          <Link to="/learn" className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 transition-colors">
            Course Index
          </Link>
          <Link to="/scanner" className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 transition-colors">
            Full Scanner
          </Link>
          <Link to="/mutate" className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 transition-colors">
            Mutation Engine
          </Link>
          <Link to="/timeline" className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 transition-colors">
            Forensic Timeline
          </Link>
        </div>
      </div>
    </div>
  );
}

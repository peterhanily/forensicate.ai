"""Attack Complexity Score (ACS).

Computes a 4-axis threat profile from scan results:
  Sophistication -- how technically advanced the attack is
  Blast Radius   -- potential scope of damage if the attack succeeds
  Stealth        -- how hard the attack is to detect (evasion effort)
  Reversibility  -- how easy it is to recover from a successful attack

Ported from the TypeScript attackComplexity.ts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .types import CompoundThreat, RuleMatch

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

AttackComplexityLabel = Literal[
    "trivial", "basic", "intermediate", "advanced", "expert"
]


@dataclass
class AttackComplexityScore:
    """4-axis attack complexity profile."""

    sophistication: int  # 0-100
    blast_radius: int    # 0-100
    stealth: int         # 0-100
    reversibility: int   # 0-100 (higher = harder to reverse)
    overall: int         # 0-100 weighted composite
    label: AttackComplexityLabel


# ---------------------------------------------------------------------------
# Category -> axis weight tables
# ---------------------------------------------------------------------------

SOPHISTICATION_WEIGHTS: dict[str, int] = {
    # Low sophistication: simple keyword/instruction attacks
    "instruction-override": 10,
    "compliance-forcing": 10,
    "threats-consequences": 10,
    "persuasion": 15,
    # Medium sophistication: require knowledge of LLM internals
    "jailbreak": 30,
    "role-manipulation": 25,
    "safety-removal": 25,
    "prompt-extraction": 30,
    "authority-developer": 20,
    "context-manipulation": 25,
    "fiction-hypothetical": 20,
    # High sophistication: advanced techniques
    "encoding-obfuscation": 50,
    "structural": 40,
    "mcp-agent-security": 55,
    "exfiltration-supply-chain": 50,
    "ide-supply-chain": 55,
    "worm-propagation": 60,
    "rag-security": 45,
    "temporal-conditional": 50,
    "output-forensics": 35,
}

BLAST_RADIUS_WEIGHTS: dict[str, int] = {
    "instruction-override": 20,
    "jailbreak": 30,
    "safety-removal": 35,
    "prompt-extraction": 25,
    "exfiltration-supply-chain": 60,
    "worm-propagation": 70,
    "mcp-agent-security": 55,
    "ide-supply-chain": 50,
    "rag-security": 45,
    "role-manipulation": 15,
    "compliance-forcing": 15,
    "authority-developer": 20,
    "context-manipulation": 20,
    "temporal-conditional": 40,
    "output-forensics": 30,
    "encoding-obfuscation": 15,
    "structural": 15,
    "fiction-hypothetical": 10,
    "persuasion": 10,
    "threats-consequences": 10,
}

STEALTH_WEIGHTS: dict[str, int] = {
    "encoding-obfuscation": 60,
    "fiction-hypothetical": 40,
    "context-manipulation": 35,
    "structural": 30,
    "temporal-conditional": 50,
    "rag-security": 40,
    "ide-supply-chain": 45,
    "persuasion": 30,
    # Loud/obvious attacks score low on stealth
    "jailbreak": 10,
    "instruction-override": 5,
    "compliance-forcing": 10,
    "safety-removal": 10,
    "threats-consequences": 5,
    "authority-developer": 15,
    "role-manipulation": 20,
    "prompt-extraction": 20,
    "mcp-agent-security": 30,
    "exfiltration-supply-chain": 35,
    "worm-propagation": 25,
    "output-forensics": 15,
}

REVERSIBILITY_WEIGHTS: dict[str, int] = {
    "worm-propagation": 70,
    "exfiltration-supply-chain": 65,
    "rag-security": 50,
    "temporal-conditional": 55,
    "mcp-agent-security": 45,
    "ide-supply-chain": 50,
    "prompt-extraction": 40,
    "safety-removal": 30,
    "jailbreak": 25,
    "instruction-override": 15,
    "role-manipulation": 15,
    "context-manipulation": 20,
    "authority-developer": 15,
    "encoding-obfuscation": 20,
    "structural": 15,
    "compliance-forcing": 10,
    "fiction-hypothetical": 10,
    "persuasion": 10,
    "threats-consequences": 10,
    "output-forensics": 35,
}

# ---------------------------------------------------------------------------
# Rule-ID -> category mapping (mirrors TypeScript ruleCategories.ts)
# ---------------------------------------------------------------------------

_RULE_PREFIX_TO_CATEGORY: dict[str, str] = {
    # Keyword rules (exact matches)
    "kw-ignore-instructions": "instruction-override",
    "kw-new-instructions": "instruction-override",
    "kw-piggybacking": "instruction-override",
    "kw-dan-jailbreak": "jailbreak",
    "kw-stan-jailbreak": "jailbreak",
    "kw-dude-jailbreak": "jailbreak",
    "kw-evil-personas": "jailbreak",
    "kw-maximum-jailbreak": "jailbreak",
    "kw-pliny-patterns": "jailbreak",
    "kw-crescendo-attack": "jailbreak",
    "kw-role-manipulation": "role-manipulation",
    "kw-dual-response": "role-manipulation",
    "kw-system-prompt": "prompt-extraction",
    "kw-leak-extraction": "prompt-extraction",
    "kw-data-exfil-commands": "exfiltration-supply-chain",
    "kw-safety-probing": "safety-removal",
    "kw-goal-manipulation": "compliance-forcing",
    "kw-compliance-forcing": "compliance-forcing",
    "kw-output-bypass": "safety-removal",
    "kw-authority-claims": "authority-developer",
    "kw-developer-mode": "authority-developer",
    "kw-identity-impersonation": "authority-developer",
    "kw-context-manipulation": "context-manipulation",
    "kw-simulation-framing": "fiction-hypothetical",
    "kw-token-manipulation": "compliance-forcing",
    "kw-hypothetical": "fiction-hypothetical",
    "kw-fiction-framing": "fiction-hypothetical",
    "kw-emotional-manipulation": "persuasion",
    "kw-urgency-pressure": "persuasion",
    "kw-threat-consequence": "threats-consequences",
    "kw-safety-override": "safety-removal",
    "kw-restriction-removal": "safety-removal",
    # Regex prefix patterns
    "rx-ignore": "instruction-override",
    "rx-disregard": "instruction-override",
    "rx-follow-only": "instruction-override",
    "rx-from-now-on": "instruction-override",
    "rx-piggybacking": "instruction-override",
    "rx-dan": "jailbreak",
    "rx-jailbreak": "jailbreak",
    "rx-role": "role-manipulation",
    "rx-character": "role-manipulation",
    "rx-dual": "role-manipulation",
    "rx-prompt": "prompt-extraction",
    "rx-repeat": "prompt-extraction",
    "rx-system": "prompt-extraction",
    "rx-secret": "prompt-extraction",
    "rx-data": "exfiltration-supply-chain",
    "rx-must": "compliance-forcing",
    "rx-cannot": "compliance-forcing",
    "rx-stop": "compliance-forcing",
    "rx-answer": "compliance-forcing",
    "rx-skip": "compliance-forcing",
    "rx-logical": "compliance-forcing",
    "rx-ethical": "compliance-forcing",
    "rx-safety": "safety-removal",
    "rx-no-longer": "safety-removal",
    "rx-restrictions": "safety-removal",
    "rx-no-rules": "safety-removal",
    "rx-alignment": "safety-removal",
    "rx-goal": "safety-removal",
    "rx-creator": "authority-developer",
    "rx-injection": "context-manipulation",
    "rx-xml": "context-manipulation",
    "rx-simulation": "fiction-hypothetical",
    "rx-fiction": "fiction-hypothetical",
    "rx-now-real": "persuasion",
    "rx-urgency": "persuasion",
    "rx-token": "threats-consequences",
    "rx-world": "threats-consequences",
    "rx-coercion": "threats-consequences",
    "rx-ai-threat": "threats-consequences",
    "rx-good-ai": "threats-consequences",
    "rx-base64": "encoding-obfuscation",
    "rx-hex": "encoding-obfuscation",
    "rx-leetspeak": "encoding-obfuscation",
    "rx-unicode": "encoding-obfuscation",
    "rx-homoglyph": "encoding-obfuscation",
    "rx-encoding": "encoding-obfuscation",
    "rx-emoji": "encoding-obfuscation",
    "rx-markdown": "structural",
    "rx-html": "structural",
    "rx-code-comment": "structural",
    # Heuristic rules
    "h-entropy": "encoding-obfuscation",
    "h-token": "structural",
    "h-nested": "structural",
    "h-language": "encoding-obfuscation",
}


def _infer_category(rule_id: str) -> str | None:
    """Infer the logical category for a rule based on its ID.

    Exact match first, then longest prefix match.
    """
    # Exact match
    if rule_id in _RULE_PREFIX_TO_CATEGORY:
        return _RULE_PREFIX_TO_CATEGORY[rule_id]
    # Longest prefix match (sorted descending by length for correctness)
    best: str | None = None
    best_len = 0
    for prefix, category in _RULE_PREFIX_TO_CATEGORY.items():
        if rule_id.startswith(prefix) and len(prefix) > best_len:
            best = category
            best_len = len(prefix)
    return best


def _infer_categories(matched_rules: list[RuleMatch]) -> set[str]:
    """Infer all unique categories from matched rules."""
    categories: set[str] = set()
    for rule in matched_rules:
        cat = _infer_category(rule.rule_id)
        if cat:
            categories.add(cat)
    return categories


# ---------------------------------------------------------------------------
# Axis computation
# ---------------------------------------------------------------------------

def _clamp(value: float) -> int:
    """Clamp value to 0-100 range and round."""
    return max(0, min(100, round(value)))


def _compute_axis_score(
    matched_categories: set[str],
    weights: dict[str, int],
    matched_rules: list[RuleMatch],
) -> int:
    """Compute a single axis score from matched categories and severity multipliers."""
    score = 0.0
    for cat in matched_categories:
        score += weights.get(cat, 0)

    # Severity multiplier: critical matches boost all axes
    critical_count = sum(1 for r in matched_rules if r.severity == "critical")
    high_count = sum(1 for r in matched_rules if r.severity == "high")
    if critical_count > 0:
        score *= 1 + critical_count * 0.1
    if high_count >= 3:
        score *= 1.1

    return _clamp(score)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _get_label(overall: int) -> AttackComplexityLabel:
    """Map overall score to a human-readable label."""
    if overall <= 20:
        return "trivial"
    if overall <= 40:
        return "basic"
    if overall <= 60:
        return "intermediate"
    if overall <= 80:
        return "advanced"
    return "expert"


def compute_attack_complexity(
    matched_rules: list[RuleMatch],
    compound_threats: list[CompoundThreat] | None = None,
) -> AttackComplexityScore | None:
    """Compute the 4-axis Attack Complexity Score from scan results.

    Args:
        matched_rules: List of RuleMatch objects from a scan.
        compound_threats: Optional list of CompoundThreat objects.

    Returns:
        AttackComplexityScore with all four axes, overall score, and label.
        Returns None if no rules matched.
    """
    if not matched_rules:
        return None

    matched_categories = _infer_categories(matched_rules)

    # Compute each axis
    sophistication = _compute_axis_score(
        matched_categories, SOPHISTICATION_WEIGHTS, matched_rules,
    )
    blast_radius = _compute_axis_score(
        matched_categories, BLAST_RADIUS_WEIGHTS, matched_rules,
    )
    stealth = _compute_axis_score(
        matched_categories, STEALTH_WEIGHTS, matched_rules,
    )
    reversibility = _compute_axis_score(
        matched_categories, REVERSIBILITY_WEIGHTS, matched_rules,
    )

    # Compound threats = more sophisticated and wider blast
    compound_count = len(compound_threats) if compound_threats else 0
    if compound_count > 0:
        sophistication = _clamp(sophistication + compound_count * 10)
        blast_radius = _clamp(blast_radius + compound_count * 8)

    # Multi-technique bonus: using many different rule types
    rule_types = {r.rule_type for r in matched_rules}
    if len(rule_types) >= 3:
        sophistication = _clamp(sophistication + 10)
        stealth = _clamp(stealth + 5)

    # Weighted composite
    overall = _clamp(
        sophistication * 0.30
        + blast_radius * 0.30
        + stealth * 0.20
        + reversibility * 0.20
    )

    label = _get_label(overall)

    return AttackComplexityScore(
        sophistication=sophistication,
        blast_radius=blast_radius,
        stealth=stealth,
        reversibility=reversibility,
        overall=overall,
        label=label,
    )


def get_complexity_description(score: AttackComplexityScore) -> str:
    """Get a human-readable description of the attack complexity."""
    descriptions: dict[AttackComplexityLabel, str] = {
        "trivial": (
            "Simple, well-known attack pattern. "
            "Easily blocked by basic guardrails."
        ),
        "basic": (
            "Common attack technique requiring minimal LLM knowledge. "
            "Standard defenses should catch this."
        ),
        "intermediate": (
            "Moderately sophisticated attack combining multiple techniques. "
            "Requires targeted defenses."
        ),
        "advanced": (
            "Highly sophisticated attack using advanced evasion or "
            "multi-vector approach. Specialized countermeasures needed."
        ),
        "expert": (
            "Expert-level attack with maximum stealth, blast radius, or "
            "persistence. Requires defense-in-depth strategy."
        ),
    }
    return descriptions[score.label]

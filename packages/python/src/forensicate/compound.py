"""Compound Threat Detection.

Identifies when multiple attack categories are present simultaneously,
indicating sophisticated multi-vector attacks.

Ported from the TypeScript compoundDetector.ts.
"""

from __future__ import annotations

from typing import Any

from .types import CompoundThreat, RuleMatch
from .rules import rule_categories


# ============================================================================
# COMPOUND THREAT DEFINITIONS
# ============================================================================

_compound_definitions: list[dict[str, Any]] = [
    {
        "id": "compound-manipulation-chain",
        "name": "Manipulation Chain",
        "description": (
            "Role manipulation combined with compliance forcing indicates "
            "a coordinated social engineering attack"
        ),
        "severity": "critical",
        "required_categories": ["role-manipulation", "compliance-forcing"],
    },
    {
        "id": "compound-extraction-attack",
        "name": "Extraction Attack",
        "description": (
            "Context manipulation paired with prompt extraction suggests "
            "a targeted data exfiltration attempt"
        ),
        "severity": "critical",
        "required_categories": ["context-manipulation", "prompt-extraction"],
    },
    {
        "id": "compound-full-bypass",
        "name": "Full Bypass Attempt",
        "description": (
            "Jailbreak techniques combined with safety removal indicates "
            "an attempt to fully disable protections"
        ),
        "severity": "critical",
        "required_categories": ["jailbreak", "safety-removal"],
    },
    {
        "id": "compound-authority-override",
        "name": "Authority Override",
        "description": (
            "Authority/developer mode claims combined with instruction override "
            "suggests impersonation-based takeover"
        ),
        "severity": "high",
        "required_categories": ["authority-developer", "instruction-override"],
    },
    {
        "id": "compound-fiction-extraction",
        "name": "Fiction-Wrapped Extraction",
        "description": (
            "Fiction/hypothetical framing combined with prompt extraction "
            "suggests disguised information theft"
        ),
        "severity": "high",
        "required_categories": ["fiction-hypothetical", "prompt-extraction"],
    },
    {
        "id": "compound-exfiltration-chain",
        "name": "Exfiltration Chain Attack",
        "description": (
            "Prompt extraction combined with context manipulation suggests "
            "coordinated data theft"
        ),
        "severity": "critical",
        "required_categories": ["prompt-extraction", "context-manipulation"],
    },
]


def _get_matched_categories(matched_rules: list[RuleMatch]) -> set[str]:
    """Map matched rules back to their category IDs."""
    matched_rule_ids = {r.rule_id for r in matched_rules}
    matched_categories: set[str] = set()

    for category in rule_categories:
        for rule_id in category["rule_ids"]:
            if rule_id in matched_rule_ids:
                matched_categories.add(category["id"])
                break

    return matched_categories


def detect_compound_threats(matched_rules: list[RuleMatch]) -> list[CompoundThreat]:
    """Detect compound threats based on matched rules.

    Run as post-processing after individual rule scanning.
    """
    if not matched_rules:
        return []

    matched_categories = _get_matched_categories(matched_rules)
    threats: list[CompoundThreat] = []

    for defn in _compound_definitions:
        triggered = [
            cat for cat in defn["required_categories"]
            if cat in matched_categories
        ]
        if len(triggered) == len(defn["required_categories"]):
            threats.append(
                CompoundThreat(
                    id=defn["id"],
                    name=defn["name"],
                    description=defn["description"],
                    severity=defn["severity"],
                    triggered_categories=triggered,
                )
            )

    return threats

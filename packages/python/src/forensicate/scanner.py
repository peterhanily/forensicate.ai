"""Prompt Injection Scanner Engine.

Executes detection rules and generates scan results.
Ported from the TypeScript scanner.ts.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any

from .compound import detect_compound_threats
from .heuristics import heuristic_rules
from .rules import get_enabled_rules, keyword_rules, regex_rules
from .types import HeuristicResult, RuleMatch, ScanResult

# Severity weights for confidence calculation
SEVERITY_WEIGHTS: dict[str, int] = {
    "low": 10,
    "medium": 25,
    "high": 40,
    "critical": 60,
}

# Maximum input length to prevent excessive CPU usage
MAX_SCAN_LENGTH = 1_000_000  # 1MB

# Regex cache to avoid recompiling the same patterns
_regex_cache: dict[str, re.Pattern[str]] = {}


def _get_cached_regex(pattern: str, flags: str) -> re.Pattern[str]:
    """Get or compile and cache a regex pattern."""
    key = f"{pattern}::{flags}"
    if key not in _regex_cache:
        re_flags = 0
        if "i" in flags:
            re_flags |= re.IGNORECASE
        if "s" in flags:
            re_flags |= re.DOTALL
        if "m" in flags:
            re_flags |= re.MULTILINE
        _regex_cache[key] = re.compile(pattern, re_flags)
    return _regex_cache[key]


def _scan_keywords(text: str, rule: dict[str, Any]) -> RuleMatch | None:
    """Scan text for keyword matches (case-insensitive)."""
    keywords = rule.get("keywords")
    if not keywords:
        return None

    lower_text = text.lower()
    matches: list[str] = []

    for keyword in keywords:
        lower_keyword = keyword.lower()
        search_index = 0

        while True:
            found_index = lower_text.find(lower_keyword, search_index)
            if found_index == -1:
                break

            # Get the actual text that matched (preserving case)
            matched_text = text[found_index:found_index + len(keyword)]
            matches.append(matched_text)
            search_index = found_index + 1

    if not matches:
        return None

    return RuleMatch(
        rule_id=rule["id"],
        rule_name=rule["name"],
        rule_type=rule["type"],
        severity=rule["severity"],
        matches=matches,
    )


def _scan_regex(text: str, rule: dict[str, Any]) -> RuleMatch | None:
    """Scan text for regex pattern matches."""
    pattern = rule.get("pattern")
    if not pattern:
        return None

    try:
        flags = rule.get("flags", "gi")
        compiled = _get_cached_regex(pattern, flags)
        found = compiled.findall(text)

        if not found:
            return None

        # findall returns strings or tuples (for groups). Normalize to strings.
        matches: list[str] = []
        for m in found:
            if isinstance(m, tuple):
                # Use the full match by searching again
                pass
            else:
                matches.append(m)

        # If we got tuples from groups, use finditer instead
        if not matches:
            matches = [m.group(0) for m in compiled.finditer(text)]

        if not matches:
            return None

        return RuleMatch(
            rule_id=rule["id"],
            rule_name=rule["name"],
            rule_type=rule["type"],
            severity=rule["severity"],
            matches=matches,
        )
    except re.error:
        return None


def _scan_heuristic(text: str, rule: dict[str, Any]) -> RuleMatch | None:
    """Execute heuristic function and return match."""
    heuristic_fn = rule.get("heuristic")
    if not heuristic_fn:
        return None

    try:
        result: HeuristicResult | None = heuristic_fn(text)
        if not result or not result.matched:
            return None

        return RuleMatch(
            rule_id=rule["id"],
            rule_name=rule["name"],
            rule_type=rule["type"],
            severity=rule["severity"],
            matches=[],
            details=result.details,
        )
    except Exception:
        return None


def _execute_rule(text: str, rule: dict[str, Any]) -> RuleMatch | None:
    """Execute a single rule against text."""
    rule_type = rule.get("type", "")
    if rule_type == "keyword":
        return _scan_keywords(text, rule)
    elif rule_type in ("regex", "encoding", "structural"):
        return _scan_regex(text, rule)
    elif rule_type == "heuristic":
        return _scan_heuristic(text, rule)
    return None


def _calculate_confidence(matched_rules: list[RuleMatch]) -> int:
    """Calculate confidence score based on matched rules.

    Uses the same logarithmic formula as the TypeScript version.
    """
    if not matched_rules:
        return 0

    total_score = 0

    # Count severity occurrences
    severity_counts: dict[str, int] = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
    }

    for match in matched_rules:
        severity_counts[match.severity] += 1
        # Use pre-computed confidence_impact if available, otherwise fall back
        if match.confidence_impact is not None:
            total_score += match.confidence_impact
        else:
            total_score += SEVERITY_WEIGHTS.get(match.severity, 10)

    # Critical findings heavily weight the confidence
    if severity_counts["critical"] > 0:
        total_score += severity_counts["critical"] * 30

    # Multiple high severity findings increase confidence
    if severity_counts["high"] >= 2:
        total_score += 20

    # Logarithmic scaling to prevent runaway scores
    # Cap confidence at 99% (never 100% certain)
    confidence = min(
        99,
        round(50 + 50 * math.log10(1 + total_score / 50)),
    )

    return confidence


def _generate_reasons(matched_rules: list[RuleMatch]) -> list[str]:
    """Generate human-readable reasons from matches."""
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    sorted_matches = sorted(
        matched_rules,
        key=lambda m: severity_order.get(m.severity, 4),
    )

    reasons: list[str] = []
    for match in sorted_matches:
        severity_labels = {
            "critical": "CRITICAL",
            "high": "HIGH",
            "medium": "MEDIUM",
            "low": "LOW",
        }
        severity_label = severity_labels.get(match.severity, "UNKNOWN")
        reason = f"[{severity_label}] {match.rule_name}"

        if match.details:
            reason += f": {match.details}"
        elif match.matches:
            display_matches = match.matches[:3]
            match_text = ", ".join(
                f'"{m[:40]}{"..." if len(m) > 40 else ""}"'
                for m in display_matches
            )
            reason += f": Found {match_text}"
            if len(match.matches) > 3:
                reason += f" (+{len(match.matches) - 3} more)"

        reasons.append(reason)

    return reasons


def scan_prompt(
    text: str,
    confidence_threshold: int = 0,
    custom_rules: list[dict[str, Any]] | None = None,
) -> ScanResult:
    """Main scan function - analyzes text against all enabled rules.

    Args:
        text: The prompt text to scan for injection patterns.
        confidence_threshold: Minimum confidence to consider positive (0-99).
            Default 0 means any match is positive.
        custom_rules: Optional list of custom rules to use instead of defaults.

    Returns:
        ScanResult with detection results.
    """
    # Guard against invalid input
    if not text or not isinstance(text, str):
        return ScanResult(
            is_positive=False,
            confidence=0,
            reasons=["No text provided"],
            matched_rules=[],
            total_rules_checked=0,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    # Guard against excessively large inputs
    if len(text) > MAX_SCAN_LENGTH:
        text = text[:MAX_SCAN_LENGTH]

    # Get rules: custom or default (keyword + regex + heuristic)
    if custom_rules is not None:
        rules = custom_rules
    else:
        rules = get_enabled_rules() + [r for r in heuristic_rules if r.get("enabled", True)]

    matched_rules: list[RuleMatch] = []

    # Execute all rules
    for rule in rules:
        if not rule.get("enabled", True):
            continue

        match = _execute_rule(text, rule)
        if match:
            # Attach per-rule weight and impact
            effective_weight = rule.get("weight", SEVERITY_WEIGHTS.get(match.severity, 10))
            impact = effective_weight
            if len(match.matches) > 1:
                impact += min(len(match.matches) * 5, 20)
            match.weight = effective_weight
            match.confidence_impact = impact
            matched_rules.append(match)

    # Calculate confidence BEFORE determining is_positive
    confidence = _calculate_confidence(matched_rules)
    is_positive = (
        len(matched_rules) > 0
        and (confidence_threshold == 0 or confidence >= confidence_threshold)
    )

    if matched_rules:
        if is_positive:
            reasons = _generate_reasons(matched_rules)
        else:
            reasons = [
                f"{len(matched_rules)} rule(s) matched but confidence "
                f"{confidence}% is below threshold {confidence_threshold}%"
            ]
    else:
        reasons = ["No injection patterns detected"]

    # Post-processing: detect compound threats
    compound_threats = detect_compound_threats(matched_rules)

    return ScanResult(
        is_positive=is_positive,
        confidence=confidence,
        reasons=reasons,
        matched_rules=matched_rules,
        total_rules_checked=sum(1 for r in rules if r.get("enabled", True)),
        timestamp=datetime.now(timezone.utc).isoformat(),
        compound_threats=compound_threats,
    )

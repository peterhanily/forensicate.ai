"""Type definitions for the Forensicate scanner."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


RuleType = Literal["keyword", "regex", "heuristic"]
RuleSeverity = Literal["low", "medium", "high", "critical"]


@dataclass
class RuleMatch:
    """Represents a single rule match during scanning."""

    rule_id: str
    rule_name: str
    rule_type: RuleType
    severity: RuleSeverity
    matches: list[str]
    details: str | None = None
    confidence_impact: int | None = None
    weight: int | None = None


@dataclass
class CompoundThreat:
    """Represents a compound threat detected from multiple rule categories."""

    id: str
    name: str
    description: str
    severity: RuleSeverity
    triggered_categories: list[str]


@dataclass
class ScanResult:
    """Result of scanning a prompt for injection patterns."""

    is_positive: bool
    confidence: int
    reasons: list[str]
    matched_rules: list[RuleMatch]
    total_rules_checked: int
    timestamp: str  # ISO format
    compound_threats: list[CompoundThreat] = field(default_factory=list)


@dataclass
class HeuristicResult:
    """Result from a heuristic analysis function."""

    matched: bool
    details: str | None = None
    confidence: float | None = None

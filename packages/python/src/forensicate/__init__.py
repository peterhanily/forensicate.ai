"""Forensicate - AI prompt injection detection engine.

87 rules across keyword, regex, and heuristic analysis. Zero dependencies.
"""

from .scanner import scan_prompt
from .types import CompoundThreat, RuleMatch, ScanResult
from .rules import keyword_rules, regex_rules, get_all_rules, get_enabled_rules
from .heuristics import (
    heuristic_rules,
    entropy_analysis,
    token_ratio_analysis,
    nested_delimiter_detection,
    language_switch_detection,
)
from .compound import detect_compound_threats
from .complexity import (
    AttackComplexityScore,
    compute_attack_complexity,
    get_complexity_description,
)
from .config import load_config, parse_config
from .test_battery import PROMPT_BATTERY, run_battery

__version__ = "1.0.0"

__all__ = [
    # Main API
    "scan_prompt",
    # Types
    "ScanResult",
    "RuleMatch",
    "CompoundThreat",
    "AttackComplexityScore",
    # Rules
    "keyword_rules",
    "regex_rules",
    "heuristic_rules",
    "get_all_rules",
    "get_enabled_rules",
    # Heuristic functions
    "entropy_analysis",
    "token_ratio_analysis",
    "nested_delimiter_detection",
    "language_switch_detection",
    # Compound detection
    "detect_compound_threats",
    # Attack complexity
    "compute_attack_complexity",
    "get_complexity_description",
    # Config
    "load_config",
    "parse_config",
    # Test battery
    "PROMPT_BATTERY",
    "run_battery",
    # Version
    "__version__",
]

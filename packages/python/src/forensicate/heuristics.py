"""Heuristic detection functions for prompt injection scanning.

These use algorithmic analysis rather than keyword/regex matching.
Ported from the TypeScript heuristicRules.ts.
"""

from __future__ import annotations

import math
import re
from typing import Any

from .types import HeuristicResult


# ============================================================================
# HEURISTIC FUNCTIONS
# ============================================================================


def shannon_entropy(s: str) -> float:
    """Calculate Shannon entropy (bits per character) for a string."""
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    length = len(s)
    entropy = 0.0
    for count in freq.values():
        p = count / length
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def entropy_analysis(text: str) -> HeuristicResult | None:
    """Shannon entropy per sliding window to catch encoded payloads.

    High entropy in short windows suggests base64, hex, or other encoded content.
    """
    if len(text) < 32:
        return None

    window_size = 64
    step = 32
    entropy_threshold = 4.5  # bits per character
    high_entropy_windows = 0
    total_windows = 0

    i = 0
    while i <= len(text) - window_size:
        window = text[i:i + window_size]
        entropy = shannon_entropy(window)
        total_windows += 1
        if entropy > entropy_threshold:
            high_entropy_windows += 1
        i += step

    if total_windows == 0:
        return None

    ratio = high_entropy_windows / total_windows
    if ratio >= 0.3 and high_entropy_windows >= 2:
        return HeuristicResult(
            matched=True,
            details=(
                f"High entropy detected in {high_entropy_windows}/{total_windows} "
                f"windows ({ratio * 100:.0f}%) - possible encoded payload"
            ),
            confidence=min(ratio * 100, 80),
        )

    return None


def token_ratio_analysis(text: str) -> HeuristicResult | None:
    """Imperative verb ratio to detect instruction-heavy prompts.

    Injection prompts tend to have a high density of imperative verbs.
    """
    words = [w for w in text.lower().split() if len(w) > 0]
    if len(words) < 10:
        return None

    imperative_verbs = {
        "ignore", "disregard", "forget", "bypass", "override", "skip",
        "reveal", "show", "display", "output", "print", "tell", "give",
        "obey", "comply", "follow", "execute", "perform", "do",
        "pretend", "act", "roleplay", "imagine", "become", "enable",
        "disable", "remove", "delete", "stop", "start", "switch",
        "answer", "respond", "repeat", "dump", "extract", "leak",
        "abandon", "cancel", "nullify", "activate", "deactivate",
    }

    imperative_count = sum(1 for word in words if word in imperative_verbs)

    ratio = imperative_count / len(words)
    if ratio >= 0.08 and imperative_count >= 3:
        return HeuristicResult(
            matched=True,
            details=(
                f"High imperative verb density: {imperative_count}/{len(words)} "
                f"words ({ratio * 100:.1f}%) are command verbs"
            ),
            confidence=min(ratio * 200, 70),
        )

    return None


def nested_delimiter_detection(text: str) -> HeuristicResult | None:
    """Nested delimiter detection - 3+ distinct delimiter types suggest framing attack.

    Attackers use nested delimiters to confuse prompt parsing.
    """
    delimiter_patterns: list[tuple[str, re.Pattern[str]]] = [
        ("square brackets", re.compile(r"\[.*?\]", re.DOTALL)),
        ("curly braces", re.compile(r"\{.*?\}", re.DOTALL)),
        ("angle brackets", re.compile(r"<.*?>", re.DOTALL)),
        ("triple backticks", re.compile(r"```[\s\S]*?```")),
        ("triple quotes", re.compile(r'"""[\s\S]*?"""')),
        ("XML-style tags", re.compile(r"</?\w+[^>]*>")),
        ("hash sections", re.compile(r"###\s*\w+")),
        ("pipe delimiters", re.compile(r"\|.*?\|")),
        ("parenthetical blocks", re.compile(r"\(.*?\)", re.DOTALL)),
    ]

    found_delimiters: list[str] = []
    for name, pattern in delimiter_patterns:
        if pattern.search(text):
            found_delimiters.append(name)

    if len(found_delimiters) >= 3:
        return HeuristicResult(
            matched=True,
            details=(
                f"{len(found_delimiters)} distinct delimiter types detected: "
                f"{', '.join(found_delimiters)} - possible framing attack"
            ),
            confidence=min(len(found_delimiters) * 15, 70),
        )

    return None


def language_switch_detection(text: str) -> HeuristicResult | None:
    """Language/script switching detection - Unicode script changes mid-prompt.

    Mixing scripts can be used for obfuscation attacks.
    """
    if len(text) < 20:
        return None

    # Detect script ranges
    scripts: list[tuple[str, re.Pattern[str]]] = [
        ("Latin", re.compile(r"[a-zA-Z]")),
        ("Cyrillic", re.compile(r"[\u0400-\u04FF]")),
        ("Greek", re.compile(r"[\u0370-\u03FF]")),
        ("Arabic", re.compile(r"[\u0600-\u06FF]")),
        ("CJK", re.compile(r"[\u4E00-\u9FFF\u3040-\u30FF]")),
        ("Devanagari", re.compile(r"[\u0900-\u097F]")),
        ("Hebrew", re.compile(r"[\u0590-\u05FF]")),
    ]

    # Split text into words and check for script transitions
    words = text.split()
    word_scripts: list[list[str]] = []
    for word in words:
        found_scripts: list[str] = []
        for name, pattern in scripts:
            if pattern.search(word):
                found_scripts.append(name)
        word_scripts.append(found_scripts)

    # Count words with mixed scripts (within a single word)
    mixed_script_words = sum(1 for ws in word_scripts if len(ws) >= 2)

    # Count distinct scripts across the text
    all_scripts: set[str] = set()
    for ws in word_scripts:
        all_scripts.update(ws)

    # Flag if: mixed script words exist OR 3+ distinct scripts used
    if mixed_script_words >= 2:
        return HeuristicResult(
            matched=True,
            details=(
                f"{mixed_script_words} words contain mixed Unicode scripts "
                f"({', '.join(sorted(all_scripts))}) - possible homoglyph obfuscation"
            ),
            confidence=min(mixed_script_words * 20, 70),
        )

    if (
        len(all_scripts) >= 3
        and "Latin" in all_scripts
        and ("Cyrillic" in all_scripts or "Greek" in all_scripts)
    ):
        return HeuristicResult(
            matched=True,
            details=(
                f"{len(all_scripts)} Unicode scripts detected including confusable "
                f"scripts: {', '.join(sorted(all_scripts))}"
            ),
            confidence=50,
        )

    return None


# ============================================================================
# HEURISTIC RULE DEFINITIONS
# ============================================================================

heuristic_rules: list[dict[str, Any]] = [
    {
        "id": "h-entropy-analysis",
        "name": "Entropy Analysis",
        "description": "Detects high Shannon entropy windows suggesting encoded payloads",
        "type": "heuristic",
        "severity": "medium",
        "enabled": True,
        "heuristic": entropy_analysis,
    },
    {
        "id": "h-token-ratio",
        "name": "Token Ratio Analysis",
        "description": "Detects high imperative verb density indicating instruction-heavy prompts",
        "type": "heuristic",
        "severity": "medium",
        "enabled": True,
        "heuristic": token_ratio_analysis,
    },
    {
        "id": "h-nested-delimiters",
        "name": "Nested Delimiter Detection",
        "description": "Detects 3+ distinct delimiter types suggesting framing attacks",
        "type": "heuristic",
        "severity": "high",
        "enabled": True,
        "heuristic": nested_delimiter_detection,
    },
    {
        "id": "h-language-switch",
        "name": "Language Switching",
        "description": "Detects Unicode script mixing that may indicate obfuscation",
        "type": "heuristic",
        "severity": "medium",
        "enabled": True,
        "heuristic": language_switch_detection,
    },
]

# Map of rule IDs to their heuristic functions
heuristic_function_map: dict[str, Any] = {
    "h-entropy-analysis": entropy_analysis,
    "h-token-ratio": token_ratio_analysis,
    "h-nested-delimiters": nested_delimiter_detection,
    "h-language-switch": language_switch_detection,
}

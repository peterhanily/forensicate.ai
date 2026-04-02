"""Tests for the built-in test battery module."""

from __future__ import annotations

import pytest

from forensicate.test_battery import PROMPT_BATTERY, run_battery
from forensicate.scanner import scan_prompt


# ============================================================================
# BATTERY STRUCTURE
# ============================================================================


class TestBatteryStructure:
    """PROMPT_BATTERY has the required shape and coverage."""

    def test_minimum_prompt_count(self):
        assert len(PROMPT_BATTERY) >= 20

    def test_all_prompts_have_required_fields(self):
        for prompt in PROMPT_BATTERY:
            assert "name" in prompt, f"Missing 'name' in prompt"
            assert "text" in prompt, f"Missing 'text' in {prompt.get('name', '?')}"
            assert "expected_positive" in prompt, f"Missing 'expected_positive' in {prompt['name']}"
            assert "category" in prompt, f"Missing 'category' in {prompt['name']}"

    def test_has_benign_prompts(self):
        benign = [p for p in PROMPT_BATTERY if not p["expected_positive"]]
        assert len(benign) >= 3, "Need at least 3 benign prompts"

    def test_has_injection_prompts(self):
        positive = [p for p in PROMPT_BATTERY if p["expected_positive"]]
        assert len(positive) >= 10, "Need at least 10 injection prompts"

    def test_unique_names(self):
        names = [p["name"] for p in PROMPT_BATTERY]
        assert len(names) == len(set(names)), "Duplicate prompt names found"

    def test_covers_key_categories(self):
        categories = {p["category"] for p in PROMPT_BATTERY}
        expected = {
            "benign",
            "instruction-override",
            "jailbreak",
            "encoding-obfuscation",
            "persuasion",
            "prompt-extraction",
        }
        missing = expected - categories
        assert not missing, f"Missing categories: {missing}"


# ============================================================================
# BENIGN PROMPTS
# ============================================================================


class TestBenignPrompts:
    """Benign prompts should not trigger the scanner (or trigger below threshold)."""

    @pytest.mark.parametrize(
        "prompt",
        [p for p in PROMPT_BATTERY if not p["expected_positive"]],
        ids=[p["name"] for p in PROMPT_BATTERY if not p["expected_positive"]],
    )
    def test_benign_not_detected(self, prompt):
        result = scan_prompt(prompt["text"])
        assert not result.is_positive, (
            f"Benign prompt '{prompt['name']}' was flagged as injection "
            f"(confidence={result.confidence}%)"
        )


# ============================================================================
# INJECTION PROMPTS
# ============================================================================


class TestInjectionPrompts:
    """Injection prompts should trigger the scanner."""

    @pytest.mark.parametrize(
        "prompt",
        [p for p in PROMPT_BATTERY if p["expected_positive"]],
        ids=[p["name"] for p in PROMPT_BATTERY if p["expected_positive"]],
    )
    def test_injection_detected(self, prompt):
        result = scan_prompt(prompt["text"])
        assert result.is_positive, (
            f"Injection prompt '{prompt['name']}' was NOT detected "
            f"(confidence={result.confidence}%, rules={len(result.matched_rules)})"
        )


# ============================================================================
# RUN_BATTERY FUNCTION
# ============================================================================


class TestRunBattery:
    """run_battery returns correctly shaped results."""

    def test_returns_list(self):
        results = run_battery()
        assert isinstance(results, list)
        assert len(results) == len(PROMPT_BATTERY)

    def test_result_fields(self):
        results = run_battery()
        for r in results:
            assert "name" in r
            assert "category" in r
            assert "expected_positive" in r
            assert "is_positive" in r
            assert "confidence" in r
            assert "pass" in r
            assert "matched_rule_count" in r

    def test_all_pass_at_default_threshold(self):
        results = run_battery(threshold=0)
        failures = [r for r in results if not r["pass"]]
        assert not failures, (
            f"{len(failures)} prompt(s) failed: "
            + ", ".join(f['name'] for f in failures)
        )

    def test_with_threshold(self):
        results = run_battery(threshold=50)
        # Should still return results for all prompts
        assert len(results) == len(PROMPT_BATTERY)
        # Each result should have a confidence value
        for r in results:
            assert isinstance(r["confidence"], int)
            assert 0 <= r["confidence"] <= 99

    def test_pass_field_correctness(self):
        results = run_battery()
        for r in results:
            expected = r["expected_positive"]
            actual = r["is_positive"]
            assert r["pass"] == (expected == actual)

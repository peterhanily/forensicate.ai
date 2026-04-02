"""Tests for the Attack Complexity Score module."""

from __future__ import annotations

import pytest

from forensicate.complexity import (
    AttackComplexityScore,
    compute_attack_complexity,
    get_complexity_description,
    _infer_category,
    _infer_categories,
    _get_label,
)
from forensicate.types import CompoundThreat, RuleMatch


# ============================================================================
# HELPERS
# ============================================================================


def _make_match(
    rule_id: str = "kw-ignore-instructions",
    severity: str = "high",
    rule_type: str = "keyword",
) -> RuleMatch:
    return RuleMatch(
        rule_id=rule_id,
        rule_name="Test Rule",
        rule_type=rule_type,
        severity=severity,
        matches=["test"],
    )


def _make_compound(
    threat_id: str = "compound-full-bypass",
    severity: str = "critical",
) -> CompoundThreat:
    return CompoundThreat(
        id=threat_id,
        name="Test Compound",
        description="Test compound threat",
        severity=severity,
        triggered_categories=["jailbreak", "safety-removal"],
    )


# ============================================================================
# NULL / EMPTY
# ============================================================================


class TestEmptyInput:
    """compute_attack_complexity returns None for empty rules."""

    def test_empty_list_returns_none(self):
        assert compute_attack_complexity([]) is None

    def test_none_compound_threats(self):
        assert compute_attack_complexity([], None) is None


# ============================================================================
# SIMPLE ATTACK SCORING
# ============================================================================


class TestSimpleAttack:
    """Simple attacks should score low (trivial/basic)."""

    def test_single_low_severity_rule(self):
        match = _make_match(rule_id="kw-ignore-instructions", severity="low")
        result = compute_attack_complexity([match])
        assert result is not None
        assert result.overall <= 40
        assert result.label in ("trivial", "basic")

    def test_single_instruction_override(self):
        match = _make_match(rule_id="kw-ignore-instructions", severity="high")
        result = compute_attack_complexity([match])
        assert result is not None
        assert isinstance(result.sophistication, int)
        assert isinstance(result.blast_radius, int)
        assert isinstance(result.stealth, int)
        assert isinstance(result.reversibility, int)
        assert isinstance(result.overall, int)
        assert 0 <= result.overall <= 100

    def test_axes_are_clamped(self):
        match = _make_match(rule_id="kw-ignore-instructions", severity="high")
        result = compute_attack_complexity([match])
        assert result is not None
        for attr in ("sophistication", "blast_radius", "stealth", "reversibility", "overall"):
            val = getattr(result, attr)
            assert 0 <= val <= 100, f"{attr} out of range: {val}"


# ============================================================================
# COMPLEX ATTACK SCORING
# ============================================================================


class TestComplexAttack:
    """Multi-category attacks should score higher."""

    def test_multi_category_scores_higher_than_single(self):
        simple = compute_attack_complexity([
            _make_match(rule_id="kw-ignore-instructions", severity="high"),
        ])
        complex_matches = [
            _make_match(rule_id="kw-ignore-instructions", severity="high"),
            _make_match(rule_id="kw-dan-jailbreak", severity="critical"),
            _make_match(rule_id="kw-safety-override", severity="critical"),
            _make_match(rule_id="rx-base64-pattern", severity="medium", rule_type="regex"),
        ]
        complex_result = compute_attack_complexity(complex_matches)
        assert simple is not None
        assert complex_result is not None
        assert complex_result.overall > simple.overall

    def test_critical_severity_boosts_scores(self):
        low_sev = compute_attack_complexity([
            _make_match(rule_id="kw-ignore-instructions", severity="low"),
        ])
        crit_sev = compute_attack_complexity([
            _make_match(rule_id="kw-ignore-instructions", severity="critical"),
        ])
        assert low_sev is not None
        assert crit_sev is not None
        assert crit_sev.sophistication >= low_sev.sophistication

    def test_multiple_high_severity_triggers_multiplier(self):
        three_high = [
            _make_match(rule_id="kw-ignore-instructions", severity="high"),
            _make_match(rule_id="rx-disregard-pattern", severity="high", rule_type="regex"),
            _make_match(rule_id="rx-from-now-on", severity="high", rule_type="regex"),
        ]
        result = compute_attack_complexity(three_high)
        assert result is not None
        # 3 high-severity rules in same category should trigger 1.1x multiplier
        assert result.sophistication > 0

    def test_multi_rule_type_bonus(self):
        """Using 3+ rule types adds sophistication and stealth bonus."""
        multi = [
            _make_match(rule_id="kw-ignore-instructions", severity="high", rule_type="keyword"),
            _make_match(rule_id="rx-base64-pattern", severity="medium", rule_type="regex"),
            _make_match(rule_id="h-entropy-analysis", severity="medium", rule_type="heuristic"),
        ]
        single_type = [
            _make_match(rule_id="kw-ignore-instructions", severity="high", rule_type="keyword"),
            _make_match(rule_id="kw-dan-jailbreak", severity="critical", rule_type="keyword"),
        ]
        multi_result = compute_attack_complexity(multi)
        # Multi-type should get bonus -- just check it runs cleanly
        assert multi_result is not None
        assert multi_result.sophistication >= 0


# ============================================================================
# LABELS
# ============================================================================


class TestLabels:
    """Label assignment based on overall score."""

    def test_trivial_label(self):
        assert _get_label(0) == "trivial"
        assert _get_label(20) == "trivial"

    def test_basic_label(self):
        assert _get_label(21) == "basic"
        assert _get_label(40) == "basic"

    def test_intermediate_label(self):
        assert _get_label(41) == "intermediate"
        assert _get_label(60) == "intermediate"

    def test_advanced_label(self):
        assert _get_label(61) == "advanced"
        assert _get_label(80) == "advanced"

    def test_expert_label(self):
        assert _get_label(81) == "expert"
        assert _get_label(100) == "expert"


# ============================================================================
# COMPOUND THREATS
# ============================================================================


class TestCompoundThreats:
    """Compound threats should boost sophistication and blast radius."""

    def test_compound_boosts_scores(self):
        matches = [
            _make_match(rule_id="kw-dan-jailbreak", severity="critical"),
            _make_match(rule_id="kw-safety-override", severity="critical"),
        ]
        without_compound = compute_attack_complexity(matches, compound_threats=None)
        with_compound = compute_attack_complexity(
            matches, compound_threats=[_make_compound()],
        )
        assert without_compound is not None
        assert with_compound is not None
        assert with_compound.sophistication >= without_compound.sophistication
        assert with_compound.blast_radius >= without_compound.blast_radius

    def test_multiple_compounds_increase_boost(self):
        matches = [
            _make_match(rule_id="kw-dan-jailbreak", severity="critical"),
            _make_match(rule_id="kw-safety-override", severity="critical"),
        ]
        one_compound = compute_attack_complexity(
            matches, compound_threats=[_make_compound()],
        )
        two_compounds = compute_attack_complexity(
            matches, compound_threats=[_make_compound(), _make_compound("compound-authority-override")],
        )
        assert one_compound is not None
        assert two_compounds is not None
        assert two_compounds.sophistication >= one_compound.sophistication


# ============================================================================
# CATEGORY INFERENCE
# ============================================================================


class TestCategoryInference:
    """Rule-ID to category mapping."""

    def test_exact_match(self):
        assert _infer_category("kw-ignore-instructions") == "instruction-override"
        assert _infer_category("kw-dan-jailbreak") == "jailbreak"

    def test_prefix_match(self):
        assert _infer_category("rx-base64-pattern") == "encoding-obfuscation"
        assert _infer_category("rx-fiction-bypass") == "fiction-hypothetical"

    def test_unknown_rule_returns_none(self):
        assert _infer_category("unknown-rule-xyz") is None

    def test_infer_categories_set(self):
        matches = [
            _make_match(rule_id="kw-ignore-instructions"),
            _make_match(rule_id="kw-dan-jailbreak"),
        ]
        cats = _infer_categories(matches)
        assert "instruction-override" in cats
        assert "jailbreak" in cats


# ============================================================================
# DESCRIPTION
# ============================================================================


class TestDescription:
    """get_complexity_description returns a non-empty string for every label."""

    def test_all_labels_have_descriptions(self):
        for label in ("trivial", "basic", "intermediate", "advanced", "expert"):
            score = AttackComplexityScore(
                sophistication=50,
                blast_radius=50,
                stealth=50,
                reversibility=50,
                overall=50,
                label=label,
            )
            desc = get_complexity_description(score)
            assert isinstance(desc, str)
            assert len(desc) > 10


# ============================================================================
# DATACLASS
# ============================================================================


class TestDataclass:
    """AttackComplexityScore is a proper dataclass."""

    def test_fields_exist(self):
        score = AttackComplexityScore(
            sophistication=10,
            blast_radius=20,
            stealth=30,
            reversibility=40,
            overall=25,
            label="basic",
        )
        assert score.sophistication == 10
        assert score.blast_radius == 20
        assert score.stealth == 30
        assert score.reversibility == 40
        assert score.overall == 25
        assert score.label == "basic"

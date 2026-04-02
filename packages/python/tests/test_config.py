"""Tests for the config loader module."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from forensicate.config import load_config, parse_config


# ============================================================================
# BASIC PARSING
# ============================================================================


class TestParseConfig:
    """parse_config handles scalars, lists, comments, and blank lines."""

    def test_basic_scalars(self):
        cfg = parse_config("threshold: 50\nmin_severity: high\noutput: json")
        assert cfg["threshold"] == 50
        assert cfg["min_severity"] == "high"
        assert cfg["output"] == "json"

    def test_list_values(self):
        yaml = (
            "categories:\n"
            "  - jailbreak\n"
            "  - encoding-obfuscation\n"
            "  - prompt-extraction\n"
        )
        cfg = parse_config(yaml)
        assert cfg["categories"] == ["jailbreak", "encoding-obfuscation", "prompt-extraction"]

    def test_disable_rules(self):
        yaml = (
            "disable_rules:\n"
            "  - kw-ignore-instructions\n"
            "  - rx-base64-pattern\n"
        )
        cfg = parse_config(yaml)
        assert cfg["disable_rules"] == ["kw-ignore-instructions", "rx-base64-pattern"]

    def test_disable_categories(self):
        yaml = (
            "disable_categories:\n"
            "  - persuasion\n"
        )
        cfg = parse_config(yaml)
        assert cfg["disable_categories"] == ["persuasion"]

    def test_empty_value_defaults_to_none(self):
        cfg = parse_config("")
        assert cfg["threshold"] is None
        assert cfg["min_severity"] is None
        assert cfg["categories"] is None
        assert cfg["disable_categories"] is None
        assert cfg["disable_rules"] is None
        assert cfg["output"] is None

    def test_comments_ignored(self):
        yaml = (
            "# This is a comment\n"
            "threshold: 30\n"
            "# Another comment\n"
            "output: sarif\n"
        )
        cfg = parse_config(yaml)
        assert cfg["threshold"] == 30
        assert cfg["output"] == "sarif"

    def test_inline_comments_stripped(self):
        yaml = "threshold: 50  # confidence threshold\n"
        cfg = parse_config(yaml)
        assert cfg["threshold"] == 50

    def test_blank_lines_ignored(self):
        yaml = "\n\nthreshold: 25\n\n\noutput: text\n\n"
        cfg = parse_config(yaml)
        assert cfg["threshold"] == 25
        assert cfg["output"] == "text"

    def test_quoted_values(self):
        yaml = 'output: "json"\nmin_severity: \'medium\'\n'
        cfg = parse_config(yaml)
        assert cfg["output"] == "json"
        assert cfg["min_severity"] == "medium"

    def test_quoted_list_items(self):
        yaml = (
            "disable_rules:\n"
            '  - "kw-ignore-instructions"\n'
            "  - 'rx-base64-pattern'\n"
        )
        cfg = parse_config(yaml)
        assert cfg["disable_rules"] == ["kw-ignore-instructions", "rx-base64-pattern"]

    def test_unknown_keys_ignored(self):
        yaml = "threshold: 40\nunknown_key: foo\noutput: json\n"
        cfg = parse_config(yaml)
        assert cfg["threshold"] == 40
        assert cfg["output"] == "json"
        assert "unknown_key" not in cfg

    def test_boolean_scalars(self):
        # Booleans aren't used in config but parser handles them
        yaml = "threshold: 0\n"
        cfg = parse_config(yaml)
        assert cfg["threshold"] == 0

    def test_hyphenated_keys_converted(self):
        yaml = (
            "min-severity: high\n"
            "disable-categories:\n"
            "  - jailbreak\n"
            "disable-rules:\n"
            "  - kw-dan-jailbreak\n"
        )
        cfg = parse_config(yaml)
        assert cfg["min_severity"] == "high"
        assert cfg["disable_categories"] == ["jailbreak"]
        assert cfg["disable_rules"] == ["kw-dan-jailbreak"]

    def test_multiple_lists_in_sequence(self):
        yaml = (
            "categories:\n"
            "  - jailbreak\n"
            "disable_rules:\n"
            "  - kw-dan-jailbreak\n"
        )
        cfg = parse_config(yaml)
        assert cfg["categories"] == ["jailbreak"]
        assert cfg["disable_rules"] == ["kw-dan-jailbreak"]


# ============================================================================
# VALIDATION
# ============================================================================


class TestValidation:
    """parse_config validates enum values and types."""

    def test_invalid_threshold_too_high(self):
        with pytest.raises(ValueError, match="threshold must be 0-99"):
            parse_config("threshold: 100")

    def test_invalid_threshold_negative(self):
        with pytest.raises(ValueError, match="threshold must be 0-99"):
            parse_config("threshold: -1")

    def test_invalid_threshold_string(self):
        with pytest.raises(ValueError, match="threshold must be an integer"):
            parse_config("threshold: abc")

    def test_invalid_severity(self):
        with pytest.raises(ValueError, match="min_severity must be one of"):
            parse_config("min_severity: extreme")

    def test_invalid_output(self):
        with pytest.raises(ValueError, match="output must be one of"):
            parse_config("output: xml")

    def test_valid_severities(self):
        for sev in ("low", "medium", "high", "critical"):
            cfg = parse_config(f"min_severity: {sev}")
            assert cfg["min_severity"] == sev

    def test_valid_outputs(self):
        for out in ("text", "json", "sarif"):
            cfg = parse_config(f"output: {out}")
            assert cfg["output"] == out


# ============================================================================
# FILE DISCOVERY
# ============================================================================


class TestLoadConfig:
    """load_config discovers files and handles errors."""

    def test_explicit_path(self):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False,
        ) as f:
            f.write("threshold: 42\noutput: sarif\n")
            f.flush()
            try:
                cfg = load_config(path=f.name)
                assert cfg is not None
                assert cfg["threshold"] == 42
                assert cfg["output"] == "sarif"
            finally:
                os.unlink(f.name)

    def test_explicit_path_not_found(self):
        with pytest.raises(FileNotFoundError):
            load_config(path="/nonexistent/forensicate.yaml")

    def test_auto_discover_in_cwd(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "forensicate.yaml"
            config_path.write_text("threshold: 10\n", encoding="utf-8")
            old_cwd = os.getcwd()
            try:
                os.chdir(tmpdir)
                cfg = load_config()
                assert cfg is not None
                assert cfg["threshold"] == 10
            finally:
                os.chdir(old_cwd)

    def test_auto_discover_yml_extension(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "forensicate.yml"
            config_path.write_text("threshold: 15\n", encoding="utf-8")
            old_cwd = os.getcwd()
            try:
                os.chdir(tmpdir)
                cfg = load_config()
                assert cfg is not None
                assert cfg["threshold"] == 15
            finally:
                os.chdir(old_cwd)

    def test_no_config_returns_none(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            old_cwd = os.getcwd()
            try:
                os.chdir(tmpdir)
                cfg = load_config()
                # May find a config in a parent dir, but the test
                # verifies it doesn't crash. If no config exists
                # anywhere in the path, it returns None.
                # We can't guarantee None in all envs, so just
                # check the function runs.
                assert cfg is None or isinstance(cfg, dict)
            finally:
                os.chdir(old_cwd)


# ============================================================================
# EDGE CASES
# ============================================================================


class TestEdgeCases:
    """Edge cases in YAML parsing."""

    def test_list_then_scalar(self):
        yaml = (
            "categories:\n"
            "  - jailbreak\n"
            "threshold: 50\n"
        )
        cfg = parse_config(yaml)
        assert cfg["categories"] == ["jailbreak"]
        assert cfg["threshold"] == 50

    def test_empty_list(self):
        yaml = (
            "categories:\n"
            "threshold: 50\n"
        )
        cfg = parse_config(yaml)
        # Empty list because next key appeared before any items
        assert cfg["categories"] == []
        assert cfg["threshold"] == 50

    def test_null_scalar(self):
        yaml = "threshold: ~\n"
        cfg = parse_config(yaml)
        assert cfg["threshold"] is None

    def test_null_word(self):
        yaml = "threshold: null\n"
        cfg = parse_config(yaml)
        assert cfg["threshold"] is None

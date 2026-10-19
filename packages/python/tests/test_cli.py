"""CLI integration checks using benign input and a literal fixture rule."""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from forensicate import cli
from forensicate.config import MAX_CONFIG_BYTES
from forensicate.scanner import MAX_SCAN_LENGTH


@pytest.fixture
def run_cli(tmp_path):
    def run(*args, config="", input_bytes=b"The blue cup is on the table."):
        config_path = tmp_path / "forensicate.yaml"
        config_path.write_text(config, encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1] / "src")
        return subprocess.run(
            [sys.executable, "-m", "forensicate", "--config", str(config_path), *args],
            input=input_bytes, capture_output=True, cwd=tmp_path, env=env,
            timeout=10,
        )
    return run


def test_default_scan_uses_all_rules(run_cli):
    result = run_cli("--json")
    assert result.returncode == 0
    assert result.stderr == b""
    assert json.loads(result.stdout)["total_rules_checked"] == 87


def test_category_and_disabled_rule_config_change_scan(run_cli):
    result = run_cli(config=(
        "output: json\ncategories:\n  - heuristic-analysis\n"
        "disable-rules:\n  - h-entropy-analysis\n"
    ))
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 3


def test_disabled_category_config_changes_scan(run_cli):
    result = run_cli(config="output: json\ndisable_categories:\n  - heuristic-analysis\n")
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 83


def test_category_override_takes_precedence(run_cli):
    result = run_cli("--categories", "heuristic-analysis", config=(
        "output: json\ncategories:\n  - structural\n"
    ))
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 4


def test_severity_config_and_cli_override(run_cli):
    config = "output: json\ncategories:\n  - heuristic-analysis\nminSeverity: critical\n"
    result = run_cli(config=config)
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 0
    overridden = run_cli("--min-severity", "low", config=config)
    assert overridden.returncode == 0
    assert json.loads(overridden.stdout)["total_rules_checked"] == 4


def test_disable_categories_cli_and_disable_rules_override(run_cli):
    result = run_cli("--disable-categories", "heuristic-analysis", config="output: json\n")
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 83
    result = run_cli("--disable-rules", "h-nested-delimiters", config=(
        "output: json\ncategories:\n  - heuristic-analysis\n"
        "disable_rules:\n  - h-entropy-analysis\n  - h-token-ratio\n"
    ))
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 3


def test_configured_sarif_and_output_override(run_cli):
    configured = run_cli(config="output: sarif\n")
    assert configured.returncode == 0
    assert json.loads(configured.stdout)["version"] == "2.1.0"
    overridden = run_cli("--output", "text", config="output: sarif\n")
    assert overridden.returncode == 0
    assert overridden.stdout.startswith(b"CLEAN")
    as_json = run_cli("--json", config="output: sarif\n")
    assert as_json.returncode == 0
    assert "is_positive" in json.loads(as_json.stdout)


def test_quiet_mode_still_accepts_output_options(run_cli):
    result = run_cli("--quiet", "--json")
    assert result.returncode == 0
    assert result.stdout == result.stderr == b""


@pytest.mark.parametrize("args,config,expected", [
    (("--threshold", "100"), "", b"threshold must"),
    (("--threshold", "-1"), "", b"threshold must"),
    (("--threshold", "1.5"), "", b"threshold must"),
    (("--categories", "missing-category"), "", b"Unknown Python categories"),
    (("--disable-rules", "missing-rule"), "", b"Unknown Python disable_rules"),
    (("--categories", "structural,"), "", b"nonempty"),
    ((), "extensions:\n  - .txt\n", b"Unsupported Python config key"),
    ((), "disable_categories:\n  - missing-category\n", b"Unknown Python disable_categories"),
    (("--benchmark",), "min_severity: high\n", b"supports threshold only"),
    (("--benchmark", "--json"), "", b"supports threshold only"),
])
def test_invalid_or_unsupported_options_fail_explicitly(run_cli, args, config, expected):
    result = run_cli(*args, config=config)
    assert result.returncode == 2
    assert result.stdout == b""
    assert expected in result.stderr
    assert b"Traceback" not in result.stderr


@pytest.mark.parametrize("file_input", [False, True])
@pytest.mark.parametrize("contents,expected", [
    (b"x" * (MAX_SCAN_LENGTH + 1), b"characters; not scanned"),
    (b"x" * (cli.MAX_INPUT_BYTES + 1), b"UTF-8 bytes; not scanned"),
    (b"\xff", b"utf-8"),
    (b"   ", b"No text to scan"),
], ids=["character-limit", "byte-limit", "invalid-utf8", "empty"])
def test_bad_input_never_produces_partial_scan(run_cli, tmp_path, file_input, contents, expected):
    args = ["--json"]
    if file_input:
        path = tmp_path / "sample.txt"
        path.write_bytes(contents)
        args.append(str(path))
    result = run_cli(*args, input_bytes=contents)
    assert result.returncode == 2
    assert result.stdout == b""
    assert expected in result.stderr
    assert b"Traceback" not in result.stderr


def test_missing_input_file_is_an_error(run_cli, tmp_path):
    result = run_cli(str(tmp_path / "missing.txt"))
    assert result.returncode == 2
    assert result.stdout == b""
    assert b"Error reading input" in result.stderr


def test_oversized_config_is_an_error(run_cli):
    result = run_cli(config="#" * (MAX_CONFIG_BYTES + 1))
    assert result.returncode == 2
    assert result.stdout == b""
    assert b"Config exceeds" in result.stderr


def test_utf8_character_boundary_is_accepted(run_cli):
    # Disable every default category so the boundary check is fast and isolated.
    result = run_cli(config=(
        "output: json\ncategories:\n  - heuristic-analysis\nmin_severity: critical\n"
    ), input_bytes=("\U0001f338" * MAX_SCAN_LENGTH).encode("utf-8"))
    assert result.returncode == 0
    assert json.loads(result.stdout)["total_rules_checked"] == 0


def test_literal_fixture_is_filtered_before_confidence_and_exit_status(monkeypatch, capsys):
    from forensicate import heuristics, rules

    fixture_rule = {
        "id": "fixture-blueberry", "name": "Literal fixture", "type": "keyword",
        "severity": "low", "enabled": True, "keywords": ["blueberry"],
    }
    monkeypatch.setattr(rules, "get_all_rules", lambda: [fixture_rule])
    monkeypatch.setattr(rules, "rule_categories", [{"id": "fixture", "rule_ids": ["fixture-blueberry"]}])
    monkeypatch.setattr(heuristics, "heuristic_rules", [])
    monkeypatch.setattr(cli, "_load_cli_config", lambda path: {"threshold": 99})

    for options, expected_exit, expected_count in [
        ([], 0, 1),
        (["--threshold", "0"], 1, 1),
        (["--threshold", "0", "--disable-rules", "fixture-blueberry"], 0, 0),
        (["--threshold", "0", "--min-severity", "high"], 0, 0),
    ]:
        monkeypatch.setattr(sys, "argv", ["forensicate", "--json", *options])
        monkeypatch.setattr(sys, "stdin", io.StringIO("blueberry"))
        with pytest.raises(SystemExit) as exited:
            cli.main()
        assert exited.value.code == expected_exit
        output = json.loads(capsys.readouterr().out)
        assert len(output["matched_rules"]) == expected_count
        assert output["is_positive"] == (expected_exit == 1)
        if not expected_count:
            assert output["confidence"] == 0
    assert fixture_rule["enabled"] is True

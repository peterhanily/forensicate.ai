"""Command-line interface for the Forensicate scanner."""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from .scanner import scan_prompt


def main() -> None:
    """Run the Forensicate CLI scanner."""
    parser = argparse.ArgumentParser(
        prog="forensicate",
        description="Forensicate.ai - AI prompt injection detection engine",
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="File to scan (reads from stdin if not provided)",
    )
    parser.add_argument(
        "-t", "--threshold",
        type=int,
        default=None,
        help="Confidence threshold (0-99, default: 0)",
    )
    parser.add_argument(
        "-j", "--json",
        action="store_true",
        dest="json_output",
        help="Output results as JSON",
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="Quiet mode - only output exit code (0=clean, 1=injection detected)",
    )
    parser.add_argument(
        "--sarif",
        action="store_true",
        help="Output results in SARIF format",
    )
    parser.add_argument(
        "--config",
        dest="config_path",
        default=None,
        help="Path to forensicate.yaml config file",
    )
    parser.add_argument(
        "--benchmark",
        action="store_true",
        help="Run the built-in test battery and report results",
    )
    parser.add_argument(
        "--version",
        action="version",
        version="forensicate 1.0.0",
    )

    args = parser.parse_args()

    # --- Load config if available ---
    config = _load_cli_config(args.config_path)

    # Merge config with CLI args (CLI takes precedence)
    threshold = args.threshold
    if threshold is None:
        threshold = config.get("threshold") if config else None
    if threshold is None:
        threshold = 0

    # --- Benchmark mode ---
    if args.benchmark:
        _run_benchmark(threshold)
        return

    # --- Normal scan mode ---
    # Read input
    if args.file:
        try:
            with open(args.file, encoding="utf-8") as f:
                text = f.read()
        except FileNotFoundError:
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            sys.exit(2)
        except OSError as e:
            print(f"Error reading file: {e}", file=sys.stderr)
            sys.exit(2)
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        print("Usage: forensicate [file] or echo 'text' | forensicate", file=sys.stderr)
        print("Run 'forensicate --help' for more options.", file=sys.stderr)
        sys.exit(2)

    if not text.strip():
        print("Error: No text to scan", file=sys.stderr)
        sys.exit(2)

    # Scan
    result = scan_prompt(text, confidence_threshold=threshold)

    # Output
    if args.quiet:
        sys.exit(1 if result.is_positive else 0)

    if args.sarif:
        sarif_output = _to_sarif(result, source_file=args.file)
        print(json.dumps(sarif_output, indent=2, default=str))
    elif args.json_output:
        output = asdict(result)
        print(json.dumps(output, indent=2, default=str))
    else:
        _print_formatted(result)

    sys.exit(1 if result.is_positive else 0)


def _load_cli_config(config_path: str | None) -> dict[str, Any] | None:
    """Load config file, handling errors gracefully."""
    from .config import load_config

    try:
        return load_config(path=config_path)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)
    except ValueError as e:
        print(f"Error in config file: {e}", file=sys.stderr)
        sys.exit(2)


def _run_benchmark(threshold: int) -> None:
    """Run the built-in test battery and print results."""
    from .test_battery import PROMPT_BATTERY, run_battery
    from .complexity import compute_attack_complexity

    print("Forensicate.ai Test Battery")
    print("=" * 60)
    print(f"Prompts: {len(PROMPT_BATTERY)}  |  Threshold: {threshold}%")
    print()

    start = time.perf_counter()
    results = run_battery(threshold=threshold)
    elapsed = time.perf_counter() - start

    passed = sum(1 for r in results if r["pass"])
    failed = len(results) - passed

    for r in results:
        status = "PASS" if r["pass"] else "FAIL"
        marker = " " if r["pass"] else ">"
        print(
            f"  {marker} [{status}] {r['name']:<40} "
            f"confidence={r['confidence']:>2}%  "
            f"rules={r['matched_rule_count']}"
        )

    print()
    print("-" * 60)
    print(f"Results: {passed}/{len(results)} passed, {failed} failed")
    print(f"Time: {elapsed * 1000:.1f}ms ({elapsed / len(results) * 1000:.1f}ms/prompt)")
    print()

    # Show ACS for compound prompt
    compound_result = scan_prompt(
        PROMPT_BATTERY[-2]["text"],  # compound-multivector
        confidence_threshold=threshold,
    )
    acs = compute_attack_complexity(
        compound_result.matched_rules,
        compound_result.compound_threats,
    )
    if acs:
        print("Attack Complexity Score (compound multi-vector prompt):")
        print(f"  Sophistication: {acs.sophistication}/100")
        print(f"  Blast Radius:   {acs.blast_radius}/100")
        print(f"  Stealth:        {acs.stealth}/100")
        print(f"  Reversibility:  {acs.reversibility}/100")
        print(f"  Overall:        {acs.overall}/100 ({acs.label})")

    sys.exit(1 if failed > 0 else 0)


def _to_sarif(result: "ScanResult", source_file: str | None = None) -> dict[str, Any]:  # noqa: F821
    """Convert scan result to SARIF v2.1.0 format."""
    from .types import ScanResult  # noqa: F811

    rules_sarif: list[dict[str, Any]] = []
    results_sarif: list[dict[str, Any]] = []

    for i, match in enumerate(result.matched_rules):
        rule_entry = {
            "id": match.rule_id,
            "name": match.rule_name,
            "shortDescription": {"text": match.rule_name},
            "defaultConfiguration": {
                "level": _severity_to_sarif_level(match.severity),
            },
        }
        rules_sarif.append(rule_entry)

        result_entry: dict[str, Any] = {
            "ruleId": match.rule_id,
            "ruleIndex": i,
            "level": _severity_to_sarif_level(match.severity),
            "message": {
                "text": match.details or (
                    f"Matched: {', '.join(match.matches[:3])}"
                    if match.matches else match.rule_name
                ),
            },
        }

        if source_file:
            result_entry["locations"] = [
                {
                    "physicalLocation": {
                        "artifactLocation": {"uri": source_file},
                    },
                }
            ]

        results_sarif.append(result_entry)

    sarif: dict[str, Any] = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "Forensicate",
                        "version": "1.0.0",
                        "informationUri": "https://forensicate.ai",
                        "rules": rules_sarif,
                    },
                },
                "results": results_sarif,
                "invocations": [
                    {
                        "executionSuccessful": True,
                        "endTimeUtc": datetime.now(timezone.utc).isoformat(),
                    },
                ],
            },
        ],
    }

    return sarif


def _severity_to_sarif_level(severity: str) -> str:
    """Map forensicate severity to SARIF level."""
    mapping = {
        "critical": "error",
        "high": "error",
        "medium": "warning",
        "low": "note",
    }
    return mapping.get(severity, "note")


def _print_formatted(result: "ScanResult") -> None:  # noqa: F821 (forward ref for readability)
    """Print scan results in a human-readable format."""
    from .types import ScanResult  # noqa: F811

    if result.is_positive:
        print(f"INJECTION DETECTED (confidence: {result.confidence}%)")
        print(f"Rules matched: {len(result.matched_rules)}/{result.total_rules_checked}")
        print()
        for reason in result.reasons:
            print(f"  {reason}")
        if result.compound_threats:
            print()
            print("Compound Threats:")
            for threat in result.compound_threats:
                print(f"  [{threat.severity.upper()}] {threat.name}: {threat.description}")

        # Show ACS if matches exist
        from .complexity import compute_attack_complexity

        acs = compute_attack_complexity(
            result.matched_rules, result.compound_threats,
        )
        if acs:
            print()
            print(f"Attack Complexity: {acs.overall}/100 ({acs.label})")
    else:
        print(f"CLEAN (confidence: {result.confidence}%)")
        print(f"Rules checked: {result.total_rules_checked}")
        if result.reasons:
            for reason in result.reasons:
                print(f"  {reason}")

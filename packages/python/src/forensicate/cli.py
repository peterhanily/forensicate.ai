"""Command-line interface for the Forensicate scanner."""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from .scanner import MAX_SCAN_LENGTH, scan_prompt


MAX_INPUT_BYTES = MAX_SCAN_LENGTH * 4


def _threshold(value: str) -> int:
    try:
        threshold = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("threshold must be an integer from 0 to 99")
    if not 0 <= threshold <= 99:
        raise argparse.ArgumentTypeError("threshold must be an integer from 0 to 99")
    return threshold


def _ids(value: str) -> list[str]:
    ids = [item.strip() for item in value.split(",")]
    if not all(ids):
        raise argparse.ArgumentTypeError("provide nonempty, comma-separated IDs")
    return ids


def _configured_rules(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Select enabled rules without modifying the shared rule registry."""
    from .heuristics import heuristic_rules
    from .rules import get_all_rules, rule_categories

    all_rules = get_all_rules() + heuristic_rules
    categories = {category["id"]: set(category["rule_ids"]) for category in rule_categories}
    categories["heuristic-analysis"] = {rule["id"] for rule in heuristic_rules}
    known_rules = {rule["id"] for rule in all_rules}

    for key in ("categories", "disable_categories", "disable_rules"):
        known = known_rules if key == "disable_rules" else categories.keys()
        unknown = set(config.get(key) or []) - set(known)
        if unknown:
            raise ValueError(f"Unknown Python {key}: {', '.join(sorted(unknown))}")

    # An empty allowlist means all categories, as in the TypeScript CLI.
    enabled_ids = set(known_rules)
    if config.get("categories"):
        enabled_ids = set().union(*(categories[key] for key in config["categories"]))
    for key in config.get("disable_categories") or []:
        enabled_ids.difference_update(categories[key])
    enabled_ids.difference_update(config.get("disable_rules") or [])
    rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    minimum = rank[config.get("min_severity") or "low"]
    return [
        rule for rule in all_rules
        if rule.get("enabled", True) and rule["id"] in enabled_ids
        and rank[rule["severity"]] >= minimum
    ]


def _read_input(path: str | None) -> str:
    """Reject oversized or malformed input before the scanner can truncate it."""
    if path:
        with open(path, "rb") as stream:
            data = stream.read(MAX_INPUT_BYTES + 1)
    elif hasattr(sys.stdin, "buffer"):
        data = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    else:
        # Support embedded callers with a text-only stdin such as StringIO.
        data = sys.stdin.read(MAX_SCAN_LENGTH + 1)
    if isinstance(data, bytes):
        if len(data) > MAX_INPUT_BYTES:
            raise ValueError(f"Input exceeds {MAX_INPUT_BYTES:,} UTF-8 bytes; not scanned")
        text = data.decode("utf-8", errors="strict")
    else:
        text = data
    if len(text) > MAX_SCAN_LENGTH:
        raise ValueError(f"Input exceeds {MAX_SCAN_LENGTH:,} characters; not scanned")
    return text


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
        type=_threshold,
        default=None,
        help="Confidence threshold (0-99, default: 0)",
    )
    output = parser.add_mutually_exclusive_group()
    output.add_argument(
        "-j", "--json",
        action="store_true",
        dest="json_output",
        help="Output results as JSON",
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="Quiet mode - exit code only (0=clean, 1=detected, 2=error)",
    )
    output.add_argument(
        "--sarif",
        action="store_true",
        help="Output results in SARIF format",
    )
    output.add_argument("--output", choices=("text", "json", "sarif"), help="Output format")
    parser.add_argument("--min-severity", choices=("low", "medium", "high", "critical"))
    parser.add_argument("--categories", type=_ids, help="Comma-separated category IDs to include")
    parser.add_argument("--disable-categories", type=_ids, help="Comma-separated category IDs to exclude")
    parser.add_argument("--disable-rules", type=_ids, help="Comma-separated rule IDs to exclude")
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
    config = _load_cli_config(args.config_path) or {}

    for key in ("min_severity", "categories", "disable_categories", "disable_rules"):
        value = getattr(args, key)
        if value is not None:
            config[key] = value
    output_format = (
        "sarif" if args.sarif else "json" if args.json_output
        else args.output or config.get("output") or "text"
    )
    try:
        rules = _configured_rules(config)
    except ValueError as error:
        parser.error(str(error))

    # Merge config with CLI args (CLI takes precedence)
    threshold = args.threshold
    if threshold is None:
        threshold = config.get("threshold") if config else None
    if threshold is None:
        threshold = 0

    # --- Benchmark mode ---
    if args.benchmark:
        if any(config.get(key) for key in (
            "min_severity", "categories", "disable_categories", "disable_rules",
        )) or output_format != "text" or args.quiet or args.file:
            parser.error("--benchmark supports threshold only; remove rule filters, output options and input files")
        _run_benchmark(threshold)
        return

    # --- Normal scan mode ---
    # Read input
    if not args.file and sys.stdin.isatty():
        print("Usage: forensicate [file] or echo 'text' | forensicate", file=sys.stderr)
        print("Run 'forensicate --help' for more options.", file=sys.stderr)
        sys.exit(2)

    try:
        text = _read_input(args.file)
    except (OSError, ValueError) as error:
        print(f"Error reading input: {error}", file=sys.stderr)
        sys.exit(2)

    if not text.strip():
        print("Error: No text to scan", file=sys.stderr)
        sys.exit(2)

    # Scan
    result = scan_prompt(text, confidence_threshold=threshold, custom_rules=rules)

    # Output
    if args.quiet:
        sys.exit(1 if result.is_positive else 0)

    if output_format == "sarif":
        sarif_output = _to_sarif(result, source_file=args.file)
        print(json.dumps(sarif_output, indent=2, default=str))
    elif output_format == "json":
        output = asdict(result)
        print(json.dumps(output, indent=2, default=str))
    else:
        _print_formatted(result)

    sys.exit(1 if result.is_positive else 0)


def _load_cli_config(config_path: str | None) -> dict[str, Any] | None:
    """Load config file, handling errors gracefully."""
    from .config import load_config

    try:
        return load_config(path=config_path, strict=True)
    except OSError as e:
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

"""Command-line interface for the Forensicate scanner."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict

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
        default=0,
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
        "--version",
        action="version",
        version="forensicate 1.0.0",
    )

    args = parser.parse_args()

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
    result = scan_prompt(text, confidence_threshold=args.threshold)

    # Output
    if args.quiet:
        sys.exit(1 if result.is_positive else 0)

    if args.json_output:
        output = asdict(result)
        print(json.dumps(output, indent=2, default=str))
    else:
        _print_formatted(result)

    sys.exit(1 if result.is_positive else 0)


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
    else:
        print(f"CLEAN (confidence: {result.confidence}%)")
        print(f"Rules checked: {result.total_rules_checked}")
        if result.reasons:
            for reason in result.reasons:
                print(f"  {reason}")

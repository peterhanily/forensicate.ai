"""Configuration loader for Forensicate scanner.

Supports YAML config files (``forensicate.yaml`` / ``forensicate.yml``) using
a dependency-free YAML subset parser.  No external packages required.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Minimal YAML subset parser (no PyYAML dependency)
# ---------------------------------------------------------------------------

_BOOL_TRUE = frozenset({"true", "yes", "on"})
_BOOL_FALSE = frozenset({"false", "no", "off"})
_VALID_OUTPUTS = frozenset({"text", "json", "sarif"})
_VALID_SEVERITIES = frozenset({"low", "medium", "high", "critical"})


def _parse_scalar(raw: str) -> Any:
    """Convert a raw YAML scalar string to a Python value."""
    stripped = raw.strip()
    if not stripped or stripped == "~" or stripped == "null":
        return None
    lower = stripped.lower()
    if lower in _BOOL_TRUE:
        return True
    if lower in _BOOL_FALSE:
        return False
    # Integer
    try:
        return int(stripped)
    except ValueError:
        pass
    # Float
    try:
        return float(stripped)
    except ValueError:
        pass
    # Strip optional quotes
    if len(stripped) >= 2 and stripped[0] in ('"', "'") and stripped[-1] == stripped[0]:
        return stripped[1:-1]
    return stripped


def parse_config(yaml_str: str) -> dict[str, Any]:
    """Parse a YAML config string into a validated config dict.

    Supports the subset of YAML used by forensicate config files:
    - Top-level scalar keys (``threshold: 50``)
    - Sequences (``categories:\\n  - foo\\n  - bar``)
    - Comments (lines starting with ``#``)
    - Blank lines

    Returns a dict with validated keys:
        threshold (int|None), min_severity (str|None),
        categories (list[str]|None), disable_categories (list[str]|None),
        disable_rules (list[str]|None), output (str|None).
    """
    result: dict[str, Any] = {
        "threshold": None,
        "min_severity": None,
        "categories": None,
        "disable_categories": None,
        "disable_rules": None,
        "output": None,
    }

    current_key: str | None = None
    current_list: list[str] | None = None

    for raw_line in yaml_str.splitlines():
        # Strip inline comments (but not inside quoted strings)
        line = re.sub(r"\s+#.*$", "", raw_line)
        stripped = line.strip()

        # Skip empty / comment-only lines
        if not stripped or stripped.startswith("#"):
            continue

        # List item under a key
        if stripped.startswith("- ") and current_key is not None and current_list is not None:
            value = stripped[2:].strip()
            # Strip quotes
            if len(value) >= 2 and value[0] in ('"', "'") and value[-1] == value[0]:
                value = value[1:-1]
            current_list.append(value)
            continue

        # Top-level key: value
        match = re.match(r"^(\w[\w_-]*):\s*(.*)?$", stripped)
        if match:
            key = match.group(1).replace("-", "_")
            raw_val = (match.group(2) or "").strip()

            # Finish any previous list
            if current_key and current_list is not None:
                result[current_key] = current_list
                current_list = None
                current_key = None

            if key not in result:
                # Unknown key -- skip
                continue

            if raw_val:
                # Scalar value on same line
                result[key] = _parse_scalar(raw_val)
                current_key = None
                current_list = None
            else:
                # Possibly a list follows on next lines
                current_key = key
                current_list = []

    # Flush final list
    if current_key and current_list is not None:
        result[current_key] = current_list

    # --- Validation ---
    _validate_config(result)

    return result


def _validate_config(cfg: dict[str, Any]) -> None:
    """Validate parsed config values, raising ValueError on bad data."""
    # threshold
    if cfg["threshold"] is not None:
        try:
            cfg["threshold"] = int(cfg["threshold"])
        except (TypeError, ValueError):
            raise ValueError(
                f"threshold must be an integer, got {cfg['threshold']!r}"
            )
        if not (0 <= cfg["threshold"] <= 99):
            raise ValueError(
                f"threshold must be 0-99, got {cfg['threshold']}"
            )

    # min_severity
    if cfg["min_severity"] is not None:
        sev = str(cfg["min_severity"]).lower()
        if sev not in _VALID_SEVERITIES:
            raise ValueError(
                f"min_severity must be one of {sorted(_VALID_SEVERITIES)}, got {sev!r}"
            )
        cfg["min_severity"] = sev

    # output
    if cfg["output"] is not None:
        out = str(cfg["output"]).lower()
        if out not in _VALID_OUTPUTS:
            raise ValueError(
                f"output must be one of {sorted(_VALID_OUTPUTS)}, got {out!r}"
            )
        cfg["output"] = out

    # list fields
    for list_key in ("categories", "disable_categories", "disable_rules"):
        val = cfg[list_key]
        if val is not None and not isinstance(val, list):
            raise ValueError(f"{list_key} must be a list, got {type(val).__name__}")


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

_CONFIG_FILENAMES = ("forensicate.yaml", "forensicate.yml")


def load_config(path: str | None = None) -> dict[str, Any] | None:
    """Load a config file.

    Args:
        path: Explicit path to a YAML config file.  If *None*, searches
            the current directory and parent directories for
            ``forensicate.yaml`` or ``forensicate.yml``.

    Returns:
        Parsed config dict, or *None* if no config file is found (when
        *path* is not specified).

    Raises:
        FileNotFoundError: If *path* is given but does not exist.
        ValueError: If the config file contains invalid values.
    """
    if path is not None:
        resolved = Path(path)
        if not resolved.is_file():
            raise FileNotFoundError(f"Config file not found: {path}")
        return parse_config(resolved.read_text(encoding="utf-8"))

    # Auto-discover: walk up from cwd
    cwd = Path(os.getcwd())
    search_dirs = [cwd] + list(cwd.parents)
    for directory in search_dirs:
        for name in _CONFIG_FILENAMES:
            candidate = directory / name
            if candidate.is_file():
                return parse_config(candidate.read_text(encoding="utf-8"))

    return None

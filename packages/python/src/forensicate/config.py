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
MAX_CONFIG_BYTES = 1_048_576


def _strip_comment(line: str) -> str:
    """Keep hashes inside quoted scalar values and strip YAML comments."""
    quote: str | None = None
    escaped = False
    scalar_start = True
    for index, char in enumerate(line):
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\" and quote == '"':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char == "#" and (index == 0 or line[index - 1].isspace()):
            return line[:index]
        if char in ('"', "'") and scalar_start:
            quote = char
            scalar_start = False
        elif char == ":" or (char == "-" and scalar_start):
            scalar_start = True
        elif not char.isspace():
            scalar_start = False
    return line


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


def parse_config(yaml_str: str, *, strict: bool = False) -> dict[str, Any]:
    """Parse a YAML config string into a validated config dict.

    Supports the subset of YAML used by forensicate config files:
    - Top-level scalar keys (``threshold: 50``)
    - Sequences (``categories:\\n  - foo\\n  - bar``)
    - Comments (lines starting with ``#``)
    - Blank lines

    With ``strict=True`` (used by the CLI), unsupported keys, duplicate keys,
    nested values and malformed lines raise ValueError instead of being ignored.

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
    seen_keys: set[str] = set()

    for line_number, raw_line in enumerate(yaml_str.splitlines(), start=1):
        # Strip inline comments (but not inside quoted strings)
        line = _strip_comment(raw_line)
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
            key = re.sub(r"([a-z])([A-Z])", r"\1_\2", key).lower()
            raw_val = (match.group(2) or "").strip()

            if strict and line[0].isspace():
                raise ValueError(f"Nested config values are unsupported (line {line_number})")
            if strict and key in seen_keys:
                raise ValueError(f"Duplicate config key: {key}")
            seen_keys.add(key)

            # Finish any previous list
            if current_key and current_list is not None:
                result[current_key] = current_list
                current_list = None
                current_key = None

            if key not in result:
                if strict:
                    raise ValueError(f"Unsupported Python config key: {key}")
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
        elif strict:
            raise ValueError(f"Unsupported config syntax on line {line_number}")

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
        value = cfg["threshold"]
        if isinstance(value, bool) or isinstance(value, float):
            raise ValueError(f"threshold must be an integer, got {value!r}")
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
        if isinstance(val, list) and any(not isinstance(item, str) or not item for item in val):
            raise ValueError(f"{list_key} must contain nonempty string IDs")


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

_CONFIG_FILENAMES = ("forensicate.yaml", "forensicate.yml")


def _read_config(path: Path, *, strict: bool) -> dict[str, Any]:
    with path.open("rb") as stream:
        data = stream.read(MAX_CONFIG_BYTES + 1)
    if len(data) > MAX_CONFIG_BYTES:
        raise ValueError(f"Config exceeds {MAX_CONFIG_BYTES:,} UTF-8 bytes")
    return parse_config(data.decode("utf-8", errors="strict"), strict=strict)


def load_config(path: str | None = None, *, strict: bool = False) -> dict[str, Any] | None:
    """Load a config file.

    Args:
        path: Explicit path to a YAML config file.  If *None*, searches
            the current directory and parent directories for
            ``forensicate.yaml`` or ``forensicate.yml``.
        strict: Reject config syntax and keys outside the supported subset.

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
        return _read_config(resolved, strict=strict)

    # Auto-discover: walk up from cwd
    cwd = Path(os.getcwd())
    search_dirs = [cwd] + list(cwd.parents)
    for directory in search_dirs:
        for name in _CONFIG_FILENAMES:
            candidate = directory / name
            if candidate.is_file():
                return _read_config(candidate, strict=strict)

    return None

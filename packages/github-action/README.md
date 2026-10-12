# Forensicate.ai GitHub Action

Scan files and PR diffs for prompt injection attacks, jailbreaks, and hidden payloads using the [Forensicate.ai](https://github.com/peterhanily/forensicate.ai) detection engine.

## Quick Start

Add this to `.github/workflows/prompt-injection-scan.yml`:

```yaml
name: Prompt Injection Scan
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: peterhanily/forensicate.ai/packages/github-action@main
```

## Usage

```yaml
- uses: peterhanily/forensicate.ai/packages/github-action@main
  with:
    confidence-threshold: '50'
    fail-on-finding: 'true'
```

## Inputs

| Input | Description | Default |
| --- | --- | --- |
| `paths` | Glob patterns to scan (space-separated). Defaults to changed files in PR. | `''` |
| `confidence-threshold` | Minimum confidence percentage to report (0-100). | `50` |
| `fail-on-finding` | Fail the action if injection is detected. | `true` |
| `scan-mode` | What to scan: `changed` (PR diff only) or `all` (all matching files). | `changed` |

## Outputs

| Output | Description |
| --- | --- |
| `findings-count` | Number of files with detected injections. |
| `total-files-scanned` | Total number of files scanned. |
| `max-confidence` | Highest confidence score found (0-99). |

## Examples

### Scan only specific file types

```yaml
- uses: peterhanily/forensicate.ai/packages/github-action@main
  with:
    paths: '**/*.md **/*.txt **/*.prompt'
    scan-mode: 'all'
```

### Warn but don't fail

```yaml
- uses: peterhanily/forensicate.ai/packages/github-action@main
  with:
    fail-on-finding: 'false'
    confidence-threshold: '70'
```

### Use outputs in subsequent steps

```yaml
- uses: peterhanily/forensicate.ai/packages/github-action@main
  id: scan
  with:
    fail-on-finding: 'false'

- if: steps.scan.outputs.findings-count > 0
  run: echo "Found ${{ steps.scan.outputs.findings-count }} files with potential prompt injections (max confidence: ${{ steps.scan.outputs.max-confidence }}%)"
```

### Full workflow with PR comment

```yaml
name: Prompt Injection Scan
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: peterhanily/forensicate.ai/packages/github-action@main
        with:
          confidence-threshold: '50'
          fail-on-finding: 'true'
          scan-mode: 'changed'
```

## How It Works

1. **Setup**: Installs Node.js and builds the scanner from the same repository revision as the action, using the committed dependency lockfile.
2. **File discovery**: In `changed` mode, reads the PR event payload and uses `git diff` to find modified files. In `all` mode, recursively lists files matching the specified glob patterns.
3. **Scanning**: Each file is read and analyzed by the Forensicate.ai detection engine using keyword, regex, heuristic, NLP, and file-based detection rules.
4. **Reporting**: Findings appear as inline PR annotations (errors, warnings, or notices depending on severity) and a summary table is added to the GitHub Actions step summary.

## Supported File Types

The scanner processes text-based files with common extensions including:

`.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.xml`, `.html`, `.csv`, `.prompt`, `.ts`, `.js`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.cursorrules`, and more.

Files with unsupported extensions and generated or dependency directories are automatically skipped.

Selected files must be readable regular files no larger than 512 KiB (524,288 bytes). The action reads files in bounded chunks and rejects selected symbolic links. An oversized, missing, unreadable, or nonregular selected file fails the scan with exit code `2`, even when `fail-on-finding` is `false`. Directory discovery errors also fail the scan. These failures produce no success outputs, SARIF report, result summary, or PR comment.

In `all` mode (including fallback from `changed`), symbolic directory links are never traversed. If a path pattern could include scannable descendants of a linked directory, the action reports that directory as **not scanned** and fails with exit code `2`. It checks target metadata only, without reading or listing the target. Use a regular directory or narrow `paths` to exclude that subtree. Patterns selecting only unsupported file extensions and excluded generated/dependency directories remain skipped.

Path and extension filters still apply, along with the excluded directories `.git`, `node_modules`, `dist`, `build`, `.next`, `__pycache__`, and `.venv`. Deleted files are excluded from PR diffs. To fix an input failure, restore access to the named file, shorten it, or deliberately narrow `paths` to the files you intend to scan.

## License

Apache-2.0

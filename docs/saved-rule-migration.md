# Saved built-in rule updates

Configuration version 2 stores current built-in defaults separately from user
preferences. `rules.localRules` contains custom/community rules;
`rules.builtInOverrides` contains only changed serializable fields and explicit
removals of optional fields. Each override retains a fallback definition so an
edited rule is not lost if its built-in ID disappears. Custom categories,
prompts, thresholds, and other preferences retain their existing fields.

`defaultsVersion` identifies the serialized default definition set. Loading a
version 2 configuration always starts from the current defaults and reapplies
the user's changes, allowing corrections to untouched fields to reach returning
users. Executable built-in heuristics come from the current scanner by ID.

## Legacy version 1

Old configurations saved complete rule snapshots without tracking edits. The
migration recognizes unchanged definitions from the `ecd1c5a` app scanner and
the `65b3d50` maintained scanner (260 definitions across 182 IDs). Enabled state
and custom weight are preserved while recognized definitions receive current
defaults. Unrecognized definitions may be intentional edits: they are preserved
and the app displays a notice, rather than silently discarding them. Subsequent
saves encode their differences as explicit overrides.

`legacyRuleSignatures.json` contains compact migration identifiers, not security
signatures or an authenticity check. They omit executable functions and the
enabled/weight preferences. Keep old entries permanently. After changing built-in
definitions, build the scanner and run `node scripts/update-rule-signatures.mjs`
with Node 24 to append new definitions. Do not replace the history with only the
latest defaults. Tests check that current definitions are represented.

Version 1 share links remain supported, including the legacy base64 form.
New share links use version 2 preferences. JSON export/import continues to use
explicit version 1 rule snapshots. Custom JavaScript function bodies are still
outside JSON/share persistence; this change does not add executable-code import.

Unsupported future configuration versions are rejected and cannot be overwritten
by automatic saving. The app shows an error; an explicit reset clears them.

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

Old configurations saved complete rule snapshots without tracking edits. A
snapshot keeps each built-in definition as it was when first saved, so the
migration recognizes every definition the deployed app has shipped (423
identifiers across 182 IDs):
- each `main` commit that changed `packages/scanner/src`, from `5d5a6e0` to `ecd1c5a`
- the `65b3d50` maintained scanner
- the 29 single-file builds GitHub Pages served on 4–8 February 2026, before
  the current history's initial commit (deployment commits outside `main`).
  The two builds whose script did not parse could not save settings.

Enabled state
and custom weight are preserved while recognized definitions receive current
defaults. The exception is `nlp-pos-imperative` and `nlp-sentence-structure`:
they could never match before version 2 and are now off by default, so their
saved enabled flag is ignored. Unrecognized definitions may be intentional
edits: they are preserved and the app displays a notice, rather than silently
discarding them. Subsequent saves encode their differences as explicit overrides.

`legacyRuleSignatures.json` lists compact migration identifiers, not security
signatures or an authenticity check: the first 32 bits of each definition's
fingerprint. The fingerprint covers the rule ID, so a flat list suffices and
keeps the bundled table small. Identifiers omit executable functions and the
enabled/weight preferences. Keep old entries permanently. After changing
built-in definitions, build the scanner and run `node scripts/update-rule-signatures.mjs`
with Node 24 to append new definitions. Do not replace the history with only the
latest defaults. Tests check that current definitions and a sample from each
earlier release are represented.

Version 1 share links remain supported, including the legacy base64 form.

The browser extension's hand-off links write the version as `'1'` and carry
only text and snippets. They therefore keep a returning user's saved settings:
the text opens in the scanner, and the snippets replace the prompt section that
has the same ID.

New share links use version 2 preferences and carry them in the URL fragment
(`/scanner/#?config=…`). Browsers do not send the fragment to the server, so
large configurations avoid GitHub Pages' request-line limit. Because changing
only the fragment does not reload the page, the scanner reloads when such a
link is opened in its own tab.

Integer thresholds from 0 to 99 (what the slider produces) are kept; anything
else is ignored, in links and in saved settings.

JSON export/import continues to use explicit version 1 rule snapshots. Custom
JavaScript function bodies are still outside JSON/share persistence; this
change does not add executable-code import.

Saving writes only what loading accepts:
- Each ID is saved once. Identical copies collapse, and the latest edit of a
  built-in wins.
- A different custom rule that reuses an ID is saved under a new ID such as
  `yaml-plugin-2`. This happens with two YAML files that have no `id`.
- Invalid built-in values and malformed custom rules are dropped instead of
  invalidating every setting.

Re-importing a YAML file replaces the rules already in that file's section.
A rule from another file with the same ID is kept, and the new rule gets a
new ID.

Unsupported future configuration versions, and saved settings of a supported
version that fail validation, are kept and cannot be overwritten by automatic
saving. The app shows an error; an explicit reset clears them.

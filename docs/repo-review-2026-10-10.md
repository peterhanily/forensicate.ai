# Forensicate repository review

Reviewed 10 October 2026. Baseline: main at `ecd1c5a`, last merged 10 June 2026. The 12 October release preparation and publication status are recorded below. Nothing has been pushed, merged, published, or deployed by this review or continuation.

The browser app is functional, but green CI overstated coverage: some app tests exercised an obsolete scanner, the dependency audit suppressed failures, and API/browser/editor integrations had untested defects. This refresh removes unpublished package claims, updates dependencies, consolidates the scanner, and fixes verified runtime problems. The hosted API and release controls still need work before making stronger production claims. Input completeness and the local deployment gate received the follow-up fixes recorded below on 12 October.

## Review scope

- Read the seven workspace manifests, Python source/configuration, deployment and CI workflows, scanner, API, browser and editor integrations, web state/storage, file extractors, public copy, and the major analysis pages.
- Inventoried all **61 PRs**: **24 merged, 31 closed, six open**. Reviewed changed-file inventories, discussions, and check results for every PR; read all six open diffs and substantive historical code/tooling changes. Generated lockfile diffs were assessed through dependency changes and audit results, not line-by-line semantic review.
- Exercised the public homepage/scanner and isolated local Chrome sessions using ordinary text and a simple PDF. This was functional validation and defensive source review, not exploitation testing.
- No authenticated production API/Cloudflare account inspection, real Firefox installation, VSCode Extension Host session, or new hosted GitHub Actions run was performed. Those limits matter for the remaining release work below.

## Changes made

| Area | Defect or misleading behavior | Result |
| --- | --- | --- |
| Public package claims | Unpublished registry install commands and package distribution claims appeared in landing copy, blog, metadata, and README | Removed the promotions; internal workspace imports and unpublished source implementations remain. Developer docs use source checkouts. |
| Dependencies | Audit reported 71 occurrences: 30 high, 28 moderate, 13 low | Refreshed dependencies/lockfile; only one narrowly documented upstream advisory remains. |
| Runtime setup | Old Node/pnpm docs, missing workspace build prerequisites, scalar build-script allowlist, API test watch mode | Node 24.13+ within v24 and pnpm 10.29.1; consistent scripts, frozen installs, explicit build-script allowlist, nonwatch tests. |
| API build command | `build:api` actually deployed | It now performs a dry-run bundle build; deployment has a separate explicit command. |
| Scanner correctness | Custom regex iteration could fail to advance; empty keywords were unsafe; YAML comments/lists could change parsed rules | Defensive iteration and parsing fixes with benign regression fixtures. |
| NLP | Two heuristics interpreted compromise tag output incorrectly and were effectively inactive | Uses the supported tag-query API with unconditional regression assertions. Scores can change because these checks now work. |
| API HTTP behavior | Empty preflight allowlist, inconsistent origin matching/headers, ignored configured text limit, unbounded JSON parsing, ineffective timer | Explicit browser-origin config, bounded body reads, honored text caps, consistent response headers, and honest synchronous execution semantics. |
| API lifecycle/auth | Usage writes could be cancelled; invalid expiry/tenant metadata and malformed limiter results were not rejected consistently | Uses `waitUntil`, validates those conditions, forwards retry metadata, and exposes threshold result as `isPositive`. |
| API development | Generated test tokens did not satisfy the authentication format | Generator now produces accepted secure tokens; examples and local KV instructions corrected. |
| Shared settings | StrictMode could consume shared URL state twice; edited rule fields and thresholds disappeared from links | URL cleanup occurs after initialization; serializable rule edits and threshold round-trip. |
| Duplicate engine | Eight obsolete app scanner files contained a separate implementation; six test suites used it | Removed the obsolete tree and repointed consumers/tests at the maintained engine. |
| PDF extraction | Removed PDF.js APIs were swallowed silently; workers/document buffers were not released | Migrated to PDF.js 6.3.289 Map/iterator APIs, typed document handling, explicit incomplete-inspection warnings, and cleanup in finally. |
| Offline download | The tracked public HTML contained an old application build | Regenerated the existing public download from the refreshed source, along with the production standalone artifact. |
| File scanning | Old async extraction could overwrite newer state; Clear left scan results behind; astral characters were corrupted | Request invalidation, wired reset callback, complete Unicode characters, and file picker types derived from supported extractors. |
| Firefox build | Firefox package retained Chrome-only background service-worker settings | Builds a module event page and declares Firefox 121 minimum. Chrome keeps its service worker. |
| GitHub Action | Tried installing an unpublished scanner, omitted composite output mappings, mishandled config/SARIF flags and path filtering | Builds scanner from action source; repaired outputs, option precedence, changed-file filters, root globs, filename handling, and annotation escaping. |
| VSCode | Typecheck incompatible with current TypeScript; root files missed; one debounce timer shared across documents | Fixed build/type configuration, matching, initial state, per-document timers/cancellation, and configured manual-scan threshold. |
| CI | Audit failures hidden; Python, action behavior, VSCode behavior/build, and API bundle were absent | Added coverage, removed blanket audit suppression, made local workspace tests sequential, and bounded concurrent jsdom instances to avoid resource contention. |
| Maintenance docs | Old rule/category/test counts and a pricing reminder that always failed | Landing counts derive from engine; stale test counters removed; pricing workflow gets the missing issue-write permission. |

Notable final dependencies: React 19.3, React Router 7.18.4, Vite 8.3.2, Vitest 4.1.11, TypeScript 6.0.3, compromise 14.17, PDF.js 6.3.289, Sharp 0.35.5, Wrangler 4.147. Node typings now follow Node 24.

## Dependency exception

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published patched braces release. Its only installed path here is `vite-plugin-singlefile → micromatch → braces`, used during builds. Inspection of the installed plugin shows micromatch is called only when `inlinePattern` is nonempty; this repo does not set it. No scanned document is passed to that code.

The specific exception and rationale are recorded in [pnpm-workspace.yaml](../pnpm-workspace.yaml). Audit exits successfully with no actionable advisories; raw metadata still counts this one high advisory. Reassess before adding inline patterns or another braces consumer, and remove the exception once a fix is available. This is not a claim of zero vulnerabilities.

PDF.js deserves a version distinction: the starting lockfile's 5.5.207 was outside the newly observed advisory range. A candidate same-major refresh selected an affected later 5.x version; final dependencies use patched 6.3.289 instead. The API migration follows the [upstream release notes](https://github.com/mozilla/pdf.js/releases/tag/v6.3.289). Firefox background configuration follows [Mozilla's supported manifest formats](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).

## Recovery and continuation — 12 October 2026

The 10 October changes survived the shutdown as uncommitted work on `main` at
`ecd1c5a`. They were preserved in place. This continuation completes the next
input-handling and deployment-workflow fixes. The user subsequently authorized
rereleasing the web app; publication status is recorded below. The hosted API
remains unfinished and outside that release.

- **Complete scanner input:** `scanPrompt` and `scanWithCategories` now throw
  `ScanInputTooLargeError` above 1,000,000 UTF-16 code units before any rule runs.
  They no longer return a result for a silently truncated prefix. The exported
  limit/error contract is documented in the scanner README.
- **Web app:** oversized text and extracted files have no successful result;
  main, learning and report views handle errors explicitly. Batch errors remain
  visible in file mode. Pending text scans are cancelled when their inputs or
  settings change, and restoring earlier text triggers a fresh scan.
- **CLI:** stdin and regular files use bounded incremental UTF-8 reads; files
  retain a separate configurable byte cap, and configuration reads are capped.
  Missing/unreadable/oversized inputs, special files, encountered symlink entries,
  and directories with no eligible files fail with exit 2. No JSON, SARIF, quiet
  success, or partial text report is emitted on an input error. Contents are read
  one input at a time. Existing extension/generated-directory filters remain.
- **Editor/browser:** VSCode reports automatic scans above its 100,000-unit limit
  as not scanned, while manual scans can use the full engine limit. Browser
  extension failures replace old result overlays, clear cached current results,
  and use a toolbar warning if a page disallows the overlay.
- **GitHub Action:** selected files above its 512 KiB byte limit or with other
  read failures now fail the job with exit 2 before success outputs, SARIF,
  summaries or comments. Intentional path/extension filters and deleted-file
  exclusions remain supported. It uses the CLI's bounded reader.
- **Pages deployment:** successful same-repository `main` push CI supplies the
  exact tested web artifact, identified by run ID and attempt. Deployment checks
  the source workflow, success, attempt and live `main` SHA before publishing;
  no fresh unchecked build runs in the deployment job. Redeploy by rerunning all
  jobs in current-main push CI. Direct manual deployment was removed. Branch
  protection still requires account configuration; hosted CI/Pages validation
  has not been performed.

Current validation on Node **24.13.0** / pnpm **10.29.1**:

- **932 JavaScript/TypeScript tests passed:** scanner 423 (396 engine/config plus
  27 CLI), app 338, API 109, browser extension 33, GitHub Action 15, VSCode 14.
  The full workspace suite passed with 329 app tests; the subsequent Pages build
  passed all 338 app tests, including the batch error and secondary-view cases.
  The final small timeline adjustment also passed the eight focused regressions,
  followed by compilation and regenerated web/standalone assets. The unchanged
  Python package was not rerun; its 163-pass result below is from 10 October.
- The web and standalone builds passed. The public offline download was
  regenerated and matches the standalone build: **3,907,808 bytes**. JavaScript
  assets total **2,079,521 bytes**, below the unchanged 2,097,152-byte budget;
  the PDF worker remains outside that existing `.js`-only budget.
- Chrome, Firefox and VSCode bundles passed. App/scanner compilation, API
  typecheck, app lint, rule consistency and `git diff --check` passed. The
  unchanged API deployment configuration was not bundled or deployed again.
- Workflow validation covered YAML/artifact wiring, event eligibility, mocked
  CI/main-SHA responses, shell syntax and ShellCheck. This is local validation,
  not evidence of a hosted deployment.
- A fresh real-browser smoke check was unavailable: the shared browser tool was
  occupied, and a single separate headless Chrome launch with a new temporary
  profile exited before opening a page. No browser assertions ran on this build.
  DOM regressions passed; the 10 October browser observations below are historical.
  Local launch evidence: `/private/tmp/forensicate-standalone-browser-evidence.json`.

The previous package-promotion removals and all earlier fixes are preserved in
the release branch below. Resume from this section and the remaining table,
rather than repeating the 10 October review or discarding its changes.

## Release preparation — 12 October 2026

The user explicitly authorized the rerelease after local validation. The release
scope is the existing static web app and offline HTML download; npm, PyPI and
the hosted API remain unpublished by this work.

Prepared on local branch `release/2026-10-12-refresh`, based on `ecd1c5a`.
The final release review added visible scan rejection and recovery to the
remaining education, transcript and timeline views, plus a Compliance sample
reset fix. Eight benign UI regressions cover these paths. CI's Python setup
action now uses v6 for its Node 24 runtime. App lint and the Pages production
build passed; the required rule-consistency hook runs when saving the commit.

The public, standalone-build and deployment-build offline copies are identical:
3,907,808 bytes, SHA-256
`50bc348f48e2f866242150b448cee01a336f2c474ade7db78055c270ad8f3684`.
Local logs are `/private/tmp/forensicate-release-build.log`,
`/private/tmp/forensicate-release-final-assets.log` and
`/private/tmp/forensicate-release-lint.log`.

Publication is blocked by this session's network access: GitHub CLI API calls
could not connect, and the request for elevated access was rejected because
sandbox approvals are disabled. No remote refs, PRs, releases or Pages settings
were changed. Authenticated remote state, hosted CI and the live release remain
unverified; the real-browser limitation described above also remains.

Continue in a session with GitHub network access. Fetch and inspect current
`origin/main` and repository/Pages settings before integrating this branch,
preserving any intervening changes. Publish through the CI-to-Pages workflow,
observe all required checks and deployment, then verify the live scanner and
offline download. The user's release authorization is already recorded; no
additional release permission is needed.

## Remaining work in priority order

Updated after the 12 October continuation. The original 10 October validation
and historical PR inventory are retained below.

| Priority | Finding | Recommended next step |
| --- | --- | --- |
| P1 | [API](../packages/api/src/index.ts) still returns 501 for batch/rules/usage. Daily/monthly quotas and tenant feature fields are declared but not enforced. | Treat as unfinished source integration. Implement accounting/entitlements or remove those contractual promises before onboarding users. |
| P1 | GitHub `main` had no branch protection or rulesets at the 10 October inspection. PRs #28/#33/#37 merged despite failed checks. | Require reviewed PRs and required checks. The local deployment workflow now consumes a validated artifact, but still needs hosted qualification after publication. Account settings have not been changed. |
| P2 | [Worker config](../packages/api/wrangler.toml) retains placeholder KV IDs, 2025 compatibility date, and legacy Durable Object migration. | Audit actual account resources/migration history, choose deployment environments, then plan a tested runtime migration. Dry-run bundling does not establish production readiness. |
| P2 | [Stored rule merging](../packages/app/src/hooks/usePersistedConfig.ts) adds new rule IDs but preserves all persisted old definitions. Returning users may retain outdated built-in patterns. | Version defaults and store user overrides separately; migrate without discarding intentional edits. |
| P2 | [Pricing database](../packages/app/src/lib/pricing/pricingDatabase.ts) was last marked updated 15 March 2026, 209 days before this review. Labels such as latest/best value are also manually maintained. | Reverify every displayed model/rate against provider sources. The reminder is repaired; rates were not relabeled as current. |
| P2 | Python is a separate reduced engine with no demonstrated parity to the maintained TypeScript rules. [Python CLI](../packages/python/src/forensicate/cli.py) applies threshold but not all parsed rule/output filters. | Keep source-only status, document supported parity, add CLI integration tests before release. |
| P2 | [VSCode packaging](../packages/vscode/package.json) invokes undeclared `vsce`. Only bundle, typecheck and mocked behavioral tests are verified. | Add explicit packaging tooling and an Extension Host/VSIX smoke test before distribution. |
| P2 | Regex/custom JavaScript rules still run synchronously; the extension's Promise.race cannot interrupt synchronous scanning. | Isolate custom work in a worker/process with enforceable cancellation and realistic input limits; don't describe timers as CPU protection. |
| P2 | Live deep links such as `/scanner` initially return HTTP 404 and then recover through the GitHub Pages redirect. Unknown paths have no dedicated app fallback. | Add hosting rewrites or prerender route shells and a real not-found page; verify SEO/status behavior. |
| P2 | Rotated/cropped PDF text can be misclassified by simplistic transform/font-size logic. Metadata-only images, audio, and video are not equivalent to OCR/transcription. | Add representative benign document fixtures and distinguish extraction limitations from threat findings. |
| P3 | Shared links intentionally omit community data and do not preserve every sample-prompt edit or custom heuristic function body. | Define a versioned, documented sharing contract and add remaining round-trip cases. |
| P3 | Compliance/forensics pages contain static framework mappings and strong reporting claims without specialist acceptance tests. | Review the mapping accuracy and copy independently before treating output as compliance evidence. |

## PR decisions

All six open PRs had green recorded checks, but those checks predate the stronger coverage here.

| Open PR | Assessment |
| --- | --- |
| [#49](https://github.com/peterhanily/forensicate.ai/pull/49) PDF.js 6.0.227 | Superseded locally by patched 6.3.289 plus API migration and PDF runtime checks. Do not merge the older proposed version over this work. |
| [#50](https://github.com/peterhanily/forensicate.ai/pull/50) checkout v7 | Rebase onto refreshed workflows; verify action-major/runtime changes in hosted CI before merge. |
| [#55](https://github.com/peterhanily/forensicate.ai/pull/55) setup-node v7 | Same: separate action-major change, rebase and run hosted CI. |
| [#57](https://github.com/peterhanily/forensicate.ai/pull/57) production dependency group | Superseded by the newer locally validated dependency set; its proposed versions did not resolve all current advisories. |
| [#58](https://github.com/peterhanily/forensicate.ai/pull/58) pnpm/action-setup 6.0.9 | Rebase onto explicit pnpm 10.29.1 configuration; verify the chosen upstream action tag and run hosted CI. |
| [#61](https://github.com/peterhanily/forensicate.ai/pull/61) development dependency group | Superseded by the broader refresh, matching Worker types, and patched transitive Sharp override. |

Older closed dependency groups were superseded or explicitly closed for compatibility/manual updating. #38 included the necessary Vite 8 chunk configuration change; #45 addressed TypeScript/Node typing; #46 repaired a React-hooks lint failure; #47 modernized action runtimes but did not itself align all project Node/pnpm versions. No PR was changed, closed, or merged during this review.

## Verification — 10 October 2026

| Check | Result |
| --- | --- |
| JavaScript/TypeScript tests | **859 passed**: scanner 392, app 325, API 109, extension 22, GitHub Action 5, VSCode 6. |
| Python tests | **163 passed**, Python 3.14 in an isolated virtual environment. CI now covers 3.10 and 3.14; local 3.10 was not available. |
| Lint and type checks | App ESLint, scanner/app TypeScript builds, API typecheck, and VSCode typecheck passed. |
| Builds | Web, standalone, Chrome, Firefox, VSCode, and API dry-run all passed. |
| API dry-run output | Wrangler 4.147.0: 967.40 KiB, gzip 248.45 KiB. No deployed resources were created or changed. |
| Dependency consistency | Frozen-lockfile validation passed; audit exits 0 with the one documented exception above. |
| Rule consistency | 182 built-in rules, 24 categories; rule verification passed. Online community imports add nine rules in the observed browser session. |
| Production browser routes | All 11 routes rendered without JavaScript exceptions or error-boundary screens; no unpublished-package install ads appeared. Analysis tools were opened, not exhaustively exercised. |
| Mobile scanner | At 390 px viewport width, document width was 390 px; no horizontal overflow observed. |
| Ordinary PDF via app UI | Visible text extracted correctly from a 604-byte, one-page sample in the production build and downloaded HTML with Chrome network access disabled. |
| Bundle budget | JS assets total 2,076,159 bytes, under the existing 2,097,152-byte budget by only 20,993 bytes. The separate PDF worker is 1,265,413 bytes and is excluded by the existing `.js`-only budget. |
| Standalone size | 3,901,745 bytes, including the PDF worker. The public download was regenerated. |
| Repository checks | `git diff --check` passed; generated Python caches are ignored. |

The initial highly concurrent validation run exceeded scanner timing limits; an isolated run passed without relaxing benchmark thresholds. The app also exceeded a generic test timeout under contention. Workspace test commands now run packages sequentially, and the app caps parallel jsdom instances at two; the subsequent production build's full app test suite passed.

Browser caveats: the hosted analytics request was blocked by this environment, so analytics delivery was not verified. Offline scanning succeeds, but optional community downloads report expected network failures, the standalone manifest link produces a file-origin warning, and PDF.js falls back from its worker after a file-origin worker warning. These are still cleanup/performance opportunities. Deep-link HTTP status and untested production integrations are listed above. Passing this suite is not evidence of universal detection accuracy or absence of vulnerabilities.

## Complete PR inventory

Recorded check states are historical, not proof that the final working tree has run on GitHub. A listed failure does not mean the PR introduced it; several inherited an already failing base.

| PR | State | Change | Recorded checks |
| --- | --- | --- | --- |
| [#1](https://github.com/peterhanily/forensicate.ai/pull/1) | merged | Add Claude Code GitHub Workflow | Green |
| [#2](https://github.com/peterhanily/forensicate.ai/pull/2) | closed | Bump actions/checkout from 4 to 6 | Lint failed; Type Check failed |
| [#3](https://github.com/peterhanily/forensicate.ai/pull/3) | closed | Bump actions/upload-pages-artifact from 3 to 4 | Lint failed; Type Check failed |
| [#4](https://github.com/peterhanily/forensicate.ai/pull/4) | closed | Bump actions/setup-node from 4 to 6 | Lint failed; Type Check failed |
| [#5](https://github.com/peterhanily/forensicate.ai/pull/5) | closed | Bump actions/upload-artifact from 4 to 6 | Lint failed; Type Check failed |
| [#6](https://github.com/peterhanily/forensicate.ai/pull/6) | closed | Bump the dev-dependencies group with 9 updates | Lint failed; Type Check failed |
| [#7](https://github.com/peterhanily/forensicate.ai/pull/7) | closed | Bump react-router-dom from 7.13.0 to 7.13.1 in the production-dependencies group | Lint failed; Type Check failed |
| [#8](https://github.com/peterhanily/forensicate.ai/pull/8) | closed | Bump globals from 16.5.0 to 17.3.0 | Lint failed; Type Check failed |
| [#9](https://github.com/peterhanily/forensicate.ai/pull/9) | closed | Bump eslint from 9.39.2 to 10.0.2 | Lint failed; Type Check failed |
| [#10](https://github.com/peterhanily/forensicate.ai/pull/10) | closed | Bump @eslint/js from 9.39.2 to 10.0.1 | Lint failed; Type Check failed |
| [#11](https://github.com/peterhanily/forensicate.ai/pull/11) | closed | Bump wrangler from 3.114.17 to 4.68.1 | Lint failed; Type Check failed |
| [#12](https://github.com/peterhanily/forensicate.ai/pull/12) | closed | Bump @types/node from 22.19.10 to 25.3.0 | Lint failed; Type Check failed |
| [#13](https://github.com/peterhanily/forensicate.ai/pull/13) | closed | Bump vitest from 2.1.9 to 4.0.18 | Lint failed; Type Check failed |
| [#14](https://github.com/peterhanily/forensicate.ai/pull/14) | merged | Bump actions/upload-artifact from 4 to 7 | Green |
| [#15](https://github.com/peterhanily/forensicate.ai/pull/15) | closed | Bump the dev-dependencies group with 9 updates | Green |
| [#16](https://github.com/peterhanily/forensicate.ai/pull/16) | closed | Bump the production-dependencies group with 2 updates | Green |
| [#17](https://github.com/peterhanily/forensicate.ai/pull/17) | merged | Bump @types/node from 22.19.10 to 25.3.3 | Green |
| [#18](https://github.com/peterhanily/forensicate.ai/pull/18) | closed | Bump wrangler from 3.114.17 to 4.69.0 | Green |
| [#19](https://github.com/peterhanily/forensicate.ai/pull/19) | merged | Bump globals from 16.5.0 to 17.4.0 | Green |
| [#20](https://github.com/peterhanily/forensicate.ai/pull/20) | merged | Bump the production-dependencies group across 1 directory with 3 updates | Green |
| [#21](https://github.com/peterhanily/forensicate.ai/pull/21) | closed | Bump the dev-dependencies group across 1 directory with 11 updates | Build failed |
| [#22](https://github.com/peterhanily/forensicate.ai/pull/22) | merged | Bump actions/github-script from 7 to 8 | Green |
| [#23](https://github.com/peterhanily/forensicate.ai/pull/23) | closed | Bump the dev-dependencies group across 1 directory with 11 updates | Green |
| [#24](https://github.com/peterhanily/forensicate.ai/pull/24) | merged | Bump pnpm/action-setup from 4 to 5 | Green |
| [#25](https://github.com/peterhanily/forensicate.ai/pull/25) | merged | Bump actions/deploy-pages from 4 to 5 | Green |
| [#26](https://github.com/peterhanily/forensicate.ai/pull/26) | closed | Bump the dev-dependencies group across 1 directory with 12 updates | Green |
| [#27](https://github.com/peterhanily/forensicate.ai/pull/27) | closed | Bump the production-dependencies group with 2 updates | Green |
| [#28](https://github.com/peterhanily/forensicate.ai/pull/28) | merged | Bump pnpm/action-setup from 5 to 6 | Lint failed; Security Audit failed; Test Scanner failed; Type Check failed |
| [#29](https://github.com/peterhanily/forensicate.ai/pull/29) | merged | Bump actions/github-script from 8 to 9 | Green |
| [#30](https://github.com/peterhanily/forensicate.ai/pull/30) | closed | Bump the production-dependencies group across 1 directory with 4 updates | Green |
| [#31](https://github.com/peterhanily/forensicate.ai/pull/31) | closed | Bump the dev-dependencies group across 1 directory with 12 updates | Green |
| [#32](https://github.com/peterhanily/forensicate.ai/pull/32) | merged | Bump actions/upload-pages-artifact from 3 to 5 | Green |
| [#33](https://github.com/peterhanily/forensicate.ai/pull/33) | merged | Bump the dev-dependencies group across 1 directory with 13 updates | Lint failed |
| [#34](https://github.com/peterhanily/forensicate.ai/pull/34) | closed | Bump the production-dependencies group across 1 directory with 5 updates | Green |
| [#35](https://github.com/peterhanily/forensicate.ai/pull/35) | closed | Bump the production-dependencies group across 1 directory with 4 updates | Green |
| [#36](https://github.com/peterhanily/forensicate.ai/pull/36) | merged | Bump the production-dependencies group across 1 directory with 4 updates | Green |
| [#37](https://github.com/peterhanily/forensicate.ai/pull/37) | merged | Bump the dev-dependencies group with 8 updates | Lint failed |
| [#38](https://github.com/peterhanily/forensicate.ai/pull/38) | merged | Bump vite from 7.3.1 to 8.0.16 | Green |
| [#39](https://github.com/peterhanily/forensicate.ai/pull/39) | merged | Bump jsdom from 28.0.0 to 29.1.1 | Green |
| [#40](https://github.com/peterhanily/forensicate.ai/pull/40) | merged | Bump eslint from 9.39.2 to 10.4.1 | Green |
| [#41](https://github.com/peterhanily/forensicate.ai/pull/41) | merged | Bump @vitejs/plugin-react from 5.1.3 to 6.0.2 | Green |
| [#42](https://github.com/peterhanily/forensicate.ai/pull/42) | merged | Bump vitest from 2.1.9 to 4.1.8 | Green |
| [#43](https://github.com/peterhanily/forensicate.ai/pull/43) | merged | Bump wrangler from 3.114.17 to 4.99.0 | Green |
| [#44](https://github.com/peterhanily/forensicate.ai/pull/44) | merged | Bump archiver from 7.0.1 to 8.0.0 | Green |
| [#45](https://github.com/peterhanily/forensicate.ai/pull/45) | merged | Bump typescript from 5.9.3 to 6.0.3 | Green |
| [#46](https://github.com/peterhanily/forensicate.ai/pull/46) | merged | Fix lint error blocking CI (Scanner.tsx setState in effect) | Green |
| [#47](https://github.com/peterhanily/forensicate.ai/pull/47) | merged | chore: modernize CI actions (Node 24), husky hook, api peer dep | Green |
| [#48](https://github.com/peterhanily/forensicate.ai/pull/48) | closed | Bump the dev-dependencies group with 13 updates | Green |
| [#49](https://github.com/peterhanily/forensicate.ai/pull/49) | open | Bump pdfjs-dist from 5.5.207 to 6.0.227 | Green |
| [#50](https://github.com/peterhanily/forensicate.ai/pull/50) | open | Bump actions/checkout from 5 to 7 | Green |
| [#51](https://github.com/peterhanily/forensicate.ai/pull/51) | closed | Bump react-router-dom from 7.17.0 to 7.18.0 in the production-dependencies group | Green |
| [#52](https://github.com/peterhanily/forensicate.ai/pull/52) | closed | Bump the dev-dependencies group across 1 directory with 14 updates | Green |
| [#53](https://github.com/peterhanily/forensicate.ai/pull/53) | closed | Bump the dev-dependencies group across 1 directory with 16 updates | Green |
| [#54](https://github.com/peterhanily/forensicate.ai/pull/54) | closed | Bump the dev-dependencies group across 1 directory with 15 updates | Green |
| [#55](https://github.com/peterhanily/forensicate.ai/pull/55) | open | Bump actions/setup-node from 5 to 7 | Green |
| [#56](https://github.com/peterhanily/forensicate.ai/pull/56) | closed | Bump the production-dependencies group across 1 directory with 2 updates | Green |
| [#57](https://github.com/peterhanily/forensicate.ai/pull/57) | open | Bump the production-dependencies group across 1 directory with 4 updates | Green |
| [#58](https://github.com/peterhanily/forensicate.ai/pull/58) | open | Bump pnpm/action-setup from 6 to 6.0.9 | Green |
| [#59](https://github.com/peterhanily/forensicate.ai/pull/59) | closed | Bump the dev-dependencies group across 1 directory with 16 updates | Green |
| [#60](https://github.com/peterhanily/forensicate.ai/pull/60) | closed | Bump the dev-dependencies group across 1 directory with 17 updates | Green |
| [#61](https://github.com/peterhanily/forensicate.ai/pull/61) | open | Bump the dev-dependencies group across 1 directory with 14 updates | Green |

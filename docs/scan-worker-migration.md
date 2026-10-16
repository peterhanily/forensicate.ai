# Browser scan isolation — remaining work

Status on 16 October 2026: scanning is still synchronous. No worker adapter or
enforceable scan timeout has been shipped. The rule editor now checks custom
JavaScript syntax without running the body while saving; this removes the
pre-scan execution path, but does not bound code executed by a later scan.

## Why this needs an explicit migration

- `RuleModal.tsx` previously called the new function on an empty string before
  saving. Measuring elapsed time afterward could not stop a hang. That call is
  removed and the editor explains the remaining execution limit.
- A `Promise.race` around synchronous code cannot preempt it.
- Existing custom functions can use browser globals. Moving them to a worker
  changes their execution environment; an unsupported rule must produce a
  visible scan failure, not a clean result. The current heuristic path catches
  exceptions as non-matches and needs an explicit error contract first.
- The app uses scanner definitions, functions, and NLP on its main thread.
  Naively embedding a second complete scanner in an inline worker duplicates
  the NLP bundle. The previous web build had only 17,109 bytes of budget left.
- Hosted CSP, worker loading, and standalone `file://` operation must all work.
  Fresh browser verification is unavailable in the current session.

## Proposed implementation

1. Specify a worker-compatible custom-rule contract: text input, serializable
   results, no DOM/window dependencies, and explicit error results. Preserve
   source and offer a clear migration error for unsupported existing functions.
2. Create a shared asynchronous scanner service with a disposable worker per
   job (or an equivalent restartable worker). Abort, deadline, worker failure,
   and stale request cancellation must terminate the actual worker. Never fall
   back to synchronous custom execution after worker startup fails.
3. Send ordered rule data and custom function source as separate fields.
   Resolve unchanged built-in functions by ID inside the worker, and preserve
   edited keyword/regex rules. Validate results and retain timestamp types.
4. Separate rule metadata needed by the UI from executable/NLP dependencies so
   the hosted build does not duplicate the engine. Use a separate hosted worker
   asset and a self-contained inline worker for the downloadable HTML. Record
   main-thread, worker, and total offline sizes separately.
5. Route text, batch, file, and secondary analysis entry points through the
   same service. Settings changes and superseding requests must cancel old work
   without allowing stale successes or errors to replace the current state.

## Acceptance criteria

- Benign fake-worker tests prove abort/deadline/startup failure call termination,
  release listeners/timers, and never produce a success or partial report.
- Rule-order, custom-edit, error, batch-retry and result-serialization tests pass.
- Hosted and offline browser tests establish actual worker operation, CSP
  compatibility, no network dependency in the offline build, responsiveness,
  cancellation, and recovery after failure.
- Custom code with incompatible dependencies fails visibly. Saving a rule never
  executes its body. The app makes no CPU-time guarantee until these checks pass.

This is a remaining implementation plan, not evidence that isolation is complete.

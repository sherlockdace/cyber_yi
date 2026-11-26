---
name: add-tests-and-ci
description: Design, add, or update reliable tests and integrate them with a repository's CI conventions. Use when work requires test coverage, CI registration, matrix or shard changes, generated workflow updates, or a defensible validation plan. Do not use for deployment or release automation unrelated to test execution.
---

# Add Tests and CI

User instructions and existing authorization take precedence over this skill's workflow defaults, within host permissions and higher-priority instructions. If a skill rule causes a pause, permission request, unfinished work, or deviation, link the exact `SKILL.md`, quote the rule, and explain its relevance; distinguish a requirement from your interpretation.

Build the smallest reliable test that protects the requested behavior, then make sure it runs in the appropriate CI tier without unnecessarily increasing cost, latency, or scope.

First decide whether a new test is needed. Existing coverage or direct inspection can be sufficient for reversible, low-impact changes; do not invent a regression suite merely because this skill is loaded. Follow an explicit request to add tests, but test observable behavior rather than matching implementation wording.

## Operating Contract

1. Discover the repository's contract before choosing a test or CI pattern.
   - Read applicable repository instructions, test documentation, nearby tests, test-runner configuration, and CI definitions.
   - Identify the commands CI actually executes and whether workflows, manifests, or matrices are generated.
   - Do not assume a language, test framework, directory layout, CI provider, runner type, resource marker, or naming convention.

2. Preserve the task boundary.
   - Add or update production code only when the user requested the behavior change or the test requires a validated fix.
   - Do not broaden a focused test task into repository-wide CI redesign.
   - Reuse existing authorization for remote test jobs; ask only when a required job exceeds its scope or cost. Changing branch protections requires explicit authorization. Prepare local changes and available evidence before any remaining approval step.

3. Treat CI placement as a policy decision, not a file-registration ritual.
   - Decide whether the test should run on every change, only for relevant paths or labels, nightly, or manually.
   - Base that decision on regression value, runtime, resource cost, platform coverage, and flakiness risk.
   - Do not add a test to a permanent matrix merely because the file is new.

4. Keep validation claims evidence-bounded.
   - A test that was not executed in its required environment is not validated there.
   - CPU runs, mocks, code inspection, collection, and syntax checks do not prove GPU-, accelerator-, distributed-, service-, or platform-specific behavior.
   - Report every material check that was not run and why.

## Workflow

### 1. Define the Regression Contract

Before writing the test, state the behavior it protects:

- the input, state, or event that triggers the behavior;
- the observable result or invariant;
- how the test would fail if the behavior regressed;
- the cheapest test layer that can catch that regression reliably.

Prefer a focused unit or contract test when it proves the behavior. Use integration or end-to-end coverage when the risk lives at a real boundary that lower-level tests cannot exercise. Avoid tests that only mirror implementation details or duplicate existing coverage.

### 2. Follow the Native Test Pattern

- Start from the nearest relevant test and preserve the repository's naming, fixtures, setup, cleanup, assertion style, and invocation pattern.
- Keep inputs deterministic and failures attributable to one behavior.
- Isolate filesystem, clock, randomness, process, network, and shared-state dependencies when they are not the behavior under test.
- Prefer observable behavior over private implementation details and excessive mocking.
- Cover meaningful negative or failure paths when they are part of the changed contract.
- Use parameterization only when each case protects a distinct boundary and failures remain readable.

When practical, confirm that the new test fails without the intended behavior and passes with it. Do not weaken assertions merely to make a flaky or misunderstood test pass.

### 3. Discover How CI Selects Tests

Determine which mechanism the repository uses:

- automatic test discovery;
- an explicit manifest, matrix, shard, target, or suite list;
- path- or change-based selection;
- labels, scheduled workflows, or manual dispatch;
- a wrapper command, build target, container, or script entrypoint;
- generated CI configuration with a separate source template.

Also identify required environments, dependencies, services, secrets, platform variants, timeouts, retries, and resource declarations. Reuse existing mechanisms and vocabulary; do not invent parallel registration paths.

### 4. Choose the CI Tier

Use the lowest-cost tier that still protects the relevant regression:

| Test shape | Typical placement | Decision rule |
| --- | --- | --- |
| Fast unit or contract test | Always-on CI | Use when it is deterministic, isolated, and broadly relevant. |
| Integration test | Always-on or path-filtered CI | Choose based on runtime, dependencies, and the breadth of affected code. |
| End-to-end or multi-service test | Conditional, scheduled, or manual CI | Use when only the real boundary proves the behavior. |
| GPU, accelerator, distributed, or platform-specific test | Resource-aware conditional CI | Declare the actual resource need and run only on a compatible runner. |
| Diagnostic, migration, or one-off test | Manual or intentionally unregistered | Keep out of permanent CI when it is not ongoing regression coverage, and state why. |

Register a new or renamed test only when the repository requires explicit registration and the intended tier should run it. When moving or renaming a test, update every existing reference, shard, path filter, cache key, and documentation entry that would otherwise become stale.

### 5. Update CI Safely

- Edit the authoritative source rather than a generated artifact.
- Run the repository's generator when configuration is generated, and include versioned generated outputs in the change when repository convention requires them.
- Preserve existing ordering, matrix schema, runner labels, permissions, dependency boundaries, and concurrency policy unless the task requires changing them.
- If CI invokes a test differently from the local test runner, make the test compatible with the real CI entrypoint rather than assuming discovery alone is sufficient.
- Declare resource needs using the repository's existing mechanism. Never infer project-specific defaults such as GPU count, timeout, retry count, or runner image.
- Keep credentials and live external services out of tests unless the repository already provides an authorized, isolated test mechanism.

### 6. Validate Proportionately

Run the narrowest checks that establish the changed contract:

1. Run the exact new or modified test using the same entrypoint CI uses when the required local environment is available.
2. Run focused neighboring tests when shared fixtures, helpers, interfaces, or registration logic changed.
3. Regenerate CI artifacts and inspect the resulting diff; when practical, rerun the generator to confirm it is stable.
4. Validate test collection, configuration parsing, or workflow syntax when the repository provides a real command for it.
5. Run broader suites only when repository policy, the change's blast radius, or the user request justifies their cost.

For hardware-, distributed-, platform-, or external-service-dependent tests, execute them only when the required target environment is available and the action is within the user's authorization and cost expectations. Otherwise run only meaningful available checks and explicitly report the remaining validation gap. Do not fabricate placeholder commands or claim remote CI results that were not observed.

Once applicable checks pass, continue to delivery. Repeat or broaden checks only for a new change, failure, unresolved concern, or required repository check.

### 7. Report Verifiable Evidence

Report only applicable items below, combining routine results into concise prose. A small change does not need a section for every item:

- which behaviors and failure paths the tests protect;
- which test files were added or changed;
- how and where each test is selected by CI, or why permanent registration was intentionally unnecessary;
- authoritative CI sources and generated files changed;
- exact commands executed and their outcomes;
- checks not run, with the environment, hardware, credentials, time, or authorization that blocked them;
- relevant resource and platform assumptions.

## Common Failure Modes

- Copying a familiar framework or CI pattern without inspecting the repository.
- Testing implementation details while leaving the public regression unprotected.
- Adding a test that passes even when the intended behavior is absent.
- Registering every new test in permanent CI without considering cost or relevance.
- Editing only a generated workflow and losing the change on regeneration.
- Updating a test path without updating matrices, shards, filters, or scripts.
- Assuming local discovery matches the command CI actually executes.
- Using retries, sleeps, broad mocks, or relaxed assertions to hide nondeterminism.
- Treating collection, syntax, mocks, CPU execution, or code inspection as target-environment proof.
- Reporting a remote or resource-dependent test as passed without observing it.

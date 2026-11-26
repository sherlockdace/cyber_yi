---
name: code-writing
description: Apply project coding rules for maintainable implementation. Use when writing, editing, refactoring, or reviewing code to keep changes simple, explicit, decoupled, and verifiable.
---

# Code Writing Guidelines

User instructions and existing authorization take precedence over this skill's workflow defaults, within host permissions and higher-priority instructions. If a skill rule causes a pause, permission request, unfinished work, or deviation, link the exact `SKILL.md`, quote the rule, and explain its relevance; distinguish a requirement from your interpretation.

## Instructions

When writing or changing code in the target project:

1. Clarify consequential ambiguity and resolve routine implementation choices.
   - Ask a focused question when the request and context do not resolve a choice that materially affects behavior, interface or data compatibility, cost, or maintenance commitments. Briefly explain the alternatives and their consequences; do not substitute an assumption for a needed user decision.
   - For routine implementation choices that satisfy the same requirements without materially different consequences, use prior decisions and repository conventions to choose a reasonable default. State assumptions that affect the result.
   - Pause work that depends on the missing decision, and continue independent authorized work while the answer is pending. Ask for any additional authorization only at the action that needs it; reuse authorization already given.
   - Keep a short verification plan for multi-step work; planning is not a separate approval gate.

2. Write the smallest useful change.
   - Implement what was asked; avoid speculative features, broad refactors, or "nice to have" flexibility.
   - Touch only the code needed for the task, and keep every changed line traceable to the request.
   - Match existing style, even if a different style would also be valid.

3. Document every function and method completely.
   - Add a docstring or the language's conventional documentation comment to every new or changed named function and method, including private helpers, callbacks, constructors, and test helpers.
   - Start with a clear summary of what the function does from the caller's perspective.
   - Document every input parameter by name. Explain its meaning and, when relevant, its expected type, shape or format, units, valid range or choices, default or sentinel behavior, and important constraints. A type annotation alone does not explain a parameter's meaning.
   - Document the output's meaning and expected type, shape, or structure. For generators, document yielded values. If there is no returned value, state the observable effect, such as mutation or I/O, instead of silently omitting the output contract.
   - Document raised exceptions and side effects when callers need them to use the function correctly.
   - Keep documentation concise and caller-focused; do not narrate the implementation line by line.

4. Prefer functions without side effects when practical.
   - Pass dependencies, configuration, and inputs explicitly through parameters.
   - Avoid reading external hyperparameters, globals, environment variables, or hidden state unless the function's responsibility requires it.
   - Isolate unavoidable side effects, such as file I/O, logging, network calls, randomness, or mutation, near the boundary of the system.

5. Keep code decoupled and easy to modify.
   - Do not hard-code fixed paths, magic constants, model names, dataset locations, or runtime assumptions unless they are truly local constants.
   - Do not infer important runtime paths from a fixed source-file layout, such as `Path(__file__).parents[n]`, when the value may change after refactors. Prefer passing roots or base directories through CLI arguments, configuration, environment variables, or caller-provided parameters.
   - Prefer parameters, configuration objects, dependency injection, or existing project configuration patterns.
   - Keep functions focused so callers can compose behavior without editing internals.
   - For simple scripts, keep CLI-only argparse setup and its default values inside `if __name__ == "__main__":` instead of wrapping them in a separate parse function.
   - For shell launch scripts, keep the script simple and explicit: define plain variables, call the target command directly, and list the CLI arguments being passed. Do not introduce arrays, helper functions, environment override frameworks, or path-detection boilerplate unless the user asks for them or the existing script already uses that pattern.

6. Keep secrets in `.env` and load them at the application boundary.
   - Store API keys, access tokens, passwords, and similar sensitive settings in `.env`; do not hard-code them or put their values in YAML, prompts, logs, or documentation.
   - In Python, use `python-dotenv` to load `.env` from an explicitly supplied path or configured project root. Preserve already-set environment variables unless the user explicitly requires overriding them.
   - Keep files containing real secrets out of version control through `.gitignore`; provide a `.env.example` with variable names and non-sensitive placeholders when setup documentation is needed.
   - Load and validate required secrets at startup, then pass them explicitly to the components that need them. Report missing variable names without exposing their values.

7. Keep configurable parameters and LLM prompts in YAML.
   - Store package runtime settings, model and generation parameters, and LLM prompt templates in external YAML files so users can change them without editing implementation code. Keep genuine implementation constants in code and secret values in `.env`.
   - In Python, read YAML with PyYAML (`pyyaml`) using `yaml.safe_load`. Validate required fields, types, and relevant constraints before using the configuration.
   - Accept the configuration path explicitly through the entry point or caller. Load configuration at the application boundary and pass the resulting values or configuration objects into core logic; avoid repeated file reads or hidden global configuration inside helpers.
   - Keep default parameter values and prompt text in YAML as the source of truth. If CLI overrides are supported, define their precedence without duplicating defaults in code.
   - When adding Python loaders, declare `python-dotenv` and `pyyaml` as needed in the project's dependency manifest.

8. Document every shell and configuration parameter in detail.
   - In new or changed shell scripts, add an adjacent comment for every variable, environment variable, positional argument, option, and explicitly passed CLI parameter. For multiline commands, place comments immediately above the command or the relevant argument group so shell continuation syntax remains valid.
   - In human-maintained configuration files, including YAML, TOML, INI, and similar formats, add an adjacent comment for every user-settable leaf parameter. Also comment structural sections when their purpose is not obvious.
   - Explain the parameter's purpose, expected type or format, unit when applicable, allowed or typical values, and the effect of changing it. Record constraints, dependencies, or the reason for the chosen value when they matter.
   - When creating or modifying a shell script or configuration file, audit all parameters in that file, including pre-existing ones, and add or improve comments where needed. Keep comments synchronized with defaults and behavior whenever a parameter changes.
   - Do not use comments that merely restate the parameter name. Never place secrets or sensitive values in comments; describe the expected secret source or environment variable instead.

9. Verify the result.
   - Prefer tests or focused checks that prove the requested behavior works.
   - For reversible, low-impact edits, use an existing check or direct inspection when sufficient; do not add tests that merely mirror the implementation.
   - Complete required checks, then stop testing unless a new edit, failure, or unresolved risk justifies more. Report target-environment gaps without treating local checks as proof of unrun behavior.
   - For bug fixes, reproduce the failure when practical before fixing it.
   - Remove only unused imports, variables, or helpers made obsolete by the current change.
   - Add new abstractions only when they reduce real duplication or clarify ownership.

## Review Checklist

Use this checklist internally; report the change, relevant validation, and material gaps in concise prose rather than reproducing every item.

- [ ] Assumptions and success criteria are clear enough to proceed.
- [ ] Consequential unresolved choices have been raised with the user; dependent work has not proceeded on an unconfirmed assumption.
- [ ] The change is focused on the user's request and avoids speculative work.
- [ ] Every new or changed named function and method has a docstring or conventional documentation comment.
- [ ] Each function document states its caller-visible purpose and explains every input parameter by name.
- [ ] Each function document explains the returned or yielded output, or explicitly states the observable effect when nothing is returned.
- [ ] Core logic receives inputs explicitly and avoids hidden state.
- [ ] Side effects are necessary, visible, and isolated.
- [ ] Paths and configuration are not unnecessarily hard-coded.
- [ ] Runtime roots or base directories are provided explicitly instead of inferred from fragile source-file hierarchy assumptions.
- [ ] Simple script argparse setup and CLI defaults stay under `if __name__ == "__main__":`.
- [ ] Shell launch scripts are simple, direct, and list the CLI arguments explicitly.
- [ ] Secrets are stored in `.env`, excluded from version control, and absent from YAML, prompts, logs, and documentation.
- [ ] Python loads `.env` with `python-dotenv` at startup, preserves existing environment values by default, and passes required secrets explicitly.
- [ ] Configurable runtime parameters and LLM prompt templates live in external YAML; Python reads them with PyYAML's `yaml.safe_load` and validates them before use.
- [ ] Configuration paths and override precedence are explicit, defaults are maintained in YAML, and required loader dependencies are declared.
- [ ] Every shell variable, environment variable, argument, option, and passed CLI parameter has a detailed adjacent comment.
- [ ] Every user-settable configuration parameter has an accurate adjacent comment covering purpose, format or unit, expected values, and behavioral impact where applicable.
- [ ] Parameter comments remain synchronized with the implemented defaults and contain no secrets.
- [ ] The change remains loosely coupled to callers and project layout.
- [ ] Verification is appropriate for the risk and scope of the change.

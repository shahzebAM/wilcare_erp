# Codex Instructions — ERP Project

This is an existing ERP application using React, NestJS, Prisma, and PostgreSQL. Preserve its current architecture and working functionality.

## Change rules
- Read the relevant existing code and project conventions before making changes.
- Make the **smallest necessary change** to fulfill the request. Do not add unnecessary code, files, packages, abstractions, or duplicate logic.
- Reuse existing components, utilities, types, and dependencies wherever possible.
- Do not refactor, reformat, rename, or modify unrelated files or functionality.
- Do not change existing business rules unless explicitly requested.
- If requirements are ambiguous or a proposed change is risky, ask for clarification first.

## Correctness and testing
- Check for pre-existing problems before editing, so they are not mistaken for regressions.
- Add or update focused tests when behavior changes; prefer the project's existing test tools.
- After editing, run the **relevant existing** lint, type-check, test, and build commands available in the repository. Run browser or integration tests when the change involves those workflows and the tools are available.
- Test normal behavior, edge cases, and likely failure paths. For payroll, Philippine tax/VAT, attendance, and inventory, verify calculations against documented rules and known expected results, including rounding and boundary cases.
- If a check fails, investigate the root cause. Do not silence errors, weaken assertions, or mark failing tests as skipped just to get a passing result.
- Never claim code is error-free or tests passed unless supported by actual results. Clearly identify anything you could not verify.

## Data safety
- Never reset, drop, truncate, or overwrite any database or production data without explicit permission.
- Never use destructive Prisma flags such as `--force-reset` without explicit permission.
- Use a separate development/test database for tests that write data. Never run destructive tests against production.
- Never expose secrets, credentials, or environment-variable values in output or commits.

## Before finishing
- Review the Git diff and remove accidental or unrelated changes.
- Summarize what changed, list the files touched, report exactly which commands/tests ran and their results, and call out any remaining risks or unverified behavior.
- If a command cannot run, say why; do not invent successful results.

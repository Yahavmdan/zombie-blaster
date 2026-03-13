---
name: ac-base-code-review
description: Review code for quality, security, and maintainability. Use when reviewing pull requests or recent changes.
---

# Base Code Review

## Workflow
- Run `git diff origin/main...HEAD` to review current-branch changes only.
- Focus on modified files and any directly impacted usages.
- Begin review immediately; do not delay for extra context.

## Core Checklist
- Correctness: intended behavior, edge cases, regressions avoided.
- Code quality: readable, well-named, no duplication, no unused code/files.
- Maintainability/style: consistent naming, proper module boundaries.
- Error handling and logging are appropriate.
- Input validation is present and safe.
- Security: no hardcoded secrets; consider OWASP Top 10 + SANS 25.
- Performance considerations addressed.
- Tests are present and meaningful for the change.

## Review Output Format
- Organize by priority: **Critical**, **High**, **Medium**, **Low**.
- Provide detailed write-ups for Critical/High; Medium/Low can be short bullets.
- Only list issues that should change; no praise.
- Include specific examples or fixes where possible.
- State:
  - what the feature attempts to accomplish
  - files changed and inspected
  - existing functionalities affected
- Report file name: `<branch> Code Review <timestamp>.md` (use most recent if already exists).

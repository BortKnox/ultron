# Contributing to Ultron

Ultron is a live desktop application. Changes should preserve the existing widget, settings, branding, intelligence, TTS, persona, and memory features unless a task explicitly says otherwise.

## Workflow

Start from an up-to-date `main` branch and create a focused branch using one of these prefixes:

- `fix/` for a defect correction
- `feat/` for a user-facing capability
- `refactor/` for an internal restructuring with no intended behavior change
- `chore/` for tooling, CI, documentation, or maintenance

Keep one concern per branch and commit. Do not commit directly to `main`, force-push any shared branch, or rewrite published history. Use a narrow reverting commit when a change must be undone.

## Verification

Use npm for dependency installation and scripts. Before opening a pull request, run:

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

Application changes also require a manual check of the affected behavior. A green build is necessary but does not prove that hardware integrations, microphone capture, audio output, or external APIs work correctly.

## Pull requests

Describe the user-visible behavior, the files or subsystems changed, automated verification, and any manual verification still required. Keep unrelated cleanup out of focused repairs. Do not remove existing UI or product features to make a change easier.

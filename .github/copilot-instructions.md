# Reviewing pull requests here

Mossop's Practical Sundries is a small shop that is bad on purpose, looked after by
[Software Factory](https://github.com/the-roganator/cv-software-factory): its agents find the shop's defects and fix them
here, one ticket at a time. Everything in it is public and part of a portfolio, so the bar is best practice and
scrupulous hygiene. Most pull requests are written by the factory's agents or by Claude Code, and merged by Martin.

The gates already check lint, formatting, types, tests, the shop's journeys, test integrity, dependencies and the
image. Don't comment on what they catch.

## The rules

Follow the rules in `docs/REVIEWERS.md`. The shop is bad on purpose, so review the diff, not the code around it: in a
fix, only the fault its ticket names is in scope, and a defect elsewhere is not a finding.

## How this repository works

- Node 24 runs TypeScript directly: erasable syntax only, `.ts` extensions in imports, no build step, no framework.
- Anything a visitor reads is in Gerald's voice, from `docs/BRIEF.md`. Pages interpolate only through `html`
  (`src/html.ts`), which escapes, and what a visitor reports is never shown on any page.
- A change comes with its test, on the tests' own catalogue (`test/support/`).
- `deploy/` is GitOps: Argo CD deploys what is on `main`, into the `website` namespace only.
- Files in `.github/CODEOWNERS` are the rules: workflows, the deployment, the Dockerfile and gate configuration. A
  change that loosens one deserves a comment saying so, however small.
- GitHub Actions are pinned by full commit SHA, with the least `permissions` a job needs, and untrusted code runs
  under `pull_request`, never `pull_request_target`.

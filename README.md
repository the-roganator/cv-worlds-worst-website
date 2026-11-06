# The World's Worst Website

[![check](https://github.com/the-roganator/cv-worlds-worst-website/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/the-roganator/cv-worlds-worst-website/actions/workflows/check.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/the-roganator/cv-worlds-worst-website/badge)](https://scorecard.dev/viewer/?uri=github.com/the-roganator/cv-worlds-worst-website)

Mossop's Practical Sundries: a small online shop, run with total sincerity, that is **bad on purpose**.

It exists to be looked after. [Software Factory](https://github.com/the-roganator/cv-software-factory) is a system of AI agents and deterministic gates that notices what is wrong with a live web app, writes the fix, proves it is safe, ships it as a canary and checks that it worked. This shop is the app it looks after, and the two together are my portfolio. I'm Martin Rogan.

## What is wrong with it

The first commit in this repository already contains more than twenty defects: wrong content, broken navigation, things that don't work, errors, slowness, inaccessible pages, missing security hygiene and gaps in its telemetry. They are real defects in working code, not a simulation.

Nothing here says where they are. There is no list, and no comment, test or commit that points at one. The factory has to find them the way anyone would: by using the shop, watching its telemetry and reading what visitors report. A private answer key exists only so that the factory's score can be checked.

So if something looks wrong, it probably is. The interesting question is how long it stays that way.

## Where to watch

Every change after the first commit is a pull request. Once the factory is running, most of them are its own, and each one says what it noticed, the evidence, what it changed and how the fix was verified.

- **[Pull requests](https://github.com/the-roganator/cv-worlds-worst-website/pulls?q=is%3Apr)**: the fixes, as they land.
- **[Software Factory](https://github.com/the-roganator/cv-software-factory)**: how it works, how far along it is, and how to run both on your own laptop.

> [!NOTE]
> **Under construction.** The shop is built and deployed; the factory that fixes it is being built in the open, a milestone at a time. Until its first fix lands, this history is short.

## The shop

Gerald Mossop sells about thirty practical items from a garage in Lower Thrumble, and describes each of them honestly. [The brief](docs/BRIEF.md) says who he is and how the shop talks; every page is written from it.

It is a small TypeScript app, run directly by Node 24 with no build step and no framework. Pages are rendered on the server. The catalogue is a SQLite database built into the image and opened read-only, and the shop holds no secrets. Its feature flags come from [flagd](https://flagd.dev), through OpenFeature, and are evaluated in the shop itself; without flagd every flag is off and the shop serves as ever. It keeps as little as it can, and [its privacy page](src/pages/privacy.ts) says what: the contact form thanks the sender and stores nothing, a report is deleted after 30 days and everything else the shop notes after 7, and the one thing it keeps on a visitor's device is a cookie for someone who asks to try a change before everyone sees it.

It is instrumented with OpenTelemetry (a trace for every request with a span for every query, request metrics for every route, and structured logs), and every page has a "Report a problem" box. A report becomes one log record. The shop does not know the factory exists; the factory reads what the shop emits.

## Run it

You need [mise](https://mise.jdx.dev).

```sh
mise install && pnpm install   # the toolchain mise.lock holds, dependencies and git hooks
make dev                       # the shop on http://localhost:8080
make check                     # what CI requires: lint, types, tests, rendered manifests
```

To run it on Kubernetes beside the factory, with its telemetry in Grafana, follow [Software Factory's README](https://github.com/the-roganator/cv-software-factory#run-it-locally): Argo CD deploys this repository's `deploy/overlays/local` from `main`.

## How changes land

The same way as in the factory's own repository, and enforced by the same settings: pull requests only, squash-merged once the required checks pass (a release or deploy pull request the factory's App opened, unchanged, builds no image; a deploy instead checks that the image it pins was built from `main`), signed and linear history, Actions pinned to full commit SHAs with minimal permissions. The gates beyond lint, types and tests (the shopper's journeys, test integrity, dependency review and an image scan), the title check, the review gate, CodeQL and Scorecard are [called from Software Factory's repository](.github/workflows) at a pinned commit, so a change here cannot loosen them.

CI builds the image; the factory's GitHub App sees it and opens a pull request that pins its digest in `deploy/`. Merging that pull request is the deployment: Argo Rollouts releases the new image as a canary beside the version it replaces, with a quarter of the traffic for three minutes, then half for three, then all of it. At each step the factory's analysis compares the canary with that version on errors, latency and the shopper's journeys, and a canary that does worse is rolled back.

[MIT licence](LICENSE)

# Contributing

Thank you for looking. This repository is unusual: the shop is bad on purpose, and fixing it is the job of [Software Factory](https://github.com/the-roganator/cv-software-factory), whose agents open most of the pull requests here. It is also half of my portfolio (I'm Martin Rogan), so I keep its scope deliberately narrow.

## Found something wrong with the shop?

Please don't open an issue or a pull request for it. Use the "Report a problem" box on the page where you saw it: that is how the factory hears about it, and seeing what it does next is the point.

A pull request that fixes one of the shop's defects will be declined, with thanks, for the same reason.

## Issues and pull requests

Problems with the repository itself (its workflows, tooling or documentation) are welcome as issues; use the templates. Small fixes of that kind are welcome as pull requests.

Because the repository is public, outside pull requests are treated as untrusted:

- Workflows from a first-time contributor wait for my approval before they run.
- Pull requests run with read-only permissions and no secrets (`pull_request`, never `pull_request_target`).
- Nothing from outside is merged automatically.

## Working on it

The toolchain is in `mise.toml`, each tool with the releases it may move within, and `mise.lock` holds the exact version of each, with its checksum for a Mac, CI's runners and the dev container, so one command installs the same toolchain everywhere:

```sh
mise install
pnpm install
make check    # lint, type-check, tests, manifests
```

Or open the repository in its dev container.

The toolchain moves only when someone upgrades it. `mise upgrade` takes the newest release in each tool's range that is at least three days old (`--bump` goes past the range, and rewrites it), and writes `mise.lock`; `mise lock` writes it again after a change by hand. Both files go in a `chore(toolchain)` pull request, through the same checks as any other change. Dependabot does not read mise, so nothing proposes it. Node is exact, at the build image's (`Dockerfile`), so a Dependabot bump of that image moves `mise.toml` and `mise.lock` with it; pnpm moves with `packageManager` in `package.json`: when `mise upgrade` takes a new pnpm, `corepack use pnpm@<that version>` in the same pull request (`test/toolchain.test.ts` fails until they agree). Without the lock, every install would take that day's release in each range; with it, CI installs with `--locked`, and fails on a request the lock does not hold.

- Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org): `fix(search): …`, `docs: …`. A commit hook checks them.
- Pull requests are squash-merged; `main` accepts nothing else.
- Anything a visitor reads is written from [the brief](docs/BRIEF.md). Start with [`AGENTS.md`](AGENTS.md): it applies to people as well as agents.

By contributing, you agree that your contribution is licensed under the [MIT licence](LICENSE).

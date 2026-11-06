# Security

This shop is bad on purpose, but it is meant to be harmless: its defects are things like a missing header or an error page that says too much, never a way in. It holds no user data and no secrets. If you find something that is more than harmless, I want to know.

## Reporting a vulnerability

Please report it privately through GitHub: [open a private report](https://github.com/the-roganator/cv-worlds-worst-website/security/advisories/new), or use the repository's **Security** tab, then **Report a vulnerability**. Don't open a public issue.

I'll acknowledge a report within five working days and keep you updated until it is resolved. This is a one-person project, so please allow reasonable time for a fix before disclosing publicly. I'm glad to credit you in the advisory.

## What counts

- A way to run code on the server, read anything it shouldn't serve, or reach anything beyond it.
- A way to make the shop show one visitor's input to another.
- A problem in this repository's workflows or supply chain.

## What doesn't

- The shop's ordinary defects: wrong content, broken pages, missing hardening headers. Report those through the "Report a problem" box on the page, and watch [Software Factory](https://github.com/the-roganator/cv-software-factory) fix them.
- Findings that need a compromised GitHub account or laptop belonging to the maintainer.

## Supported versions

Only the latest commit on `main` is supported.

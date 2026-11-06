# Reviewing

Rules for reviewing a change to this repository, beyond what the gates check. Builders should not
be concerned with this as it applies to later in the SDLC. Review the diff, not the code around it:
the shop is bad on purpose, and only the ticket's fault is in scope.

1. **Deep modules.** A module hides a decision behind a small interface. Pages and the API read
   the shop through the catalogue, never the database. (`src/catalogue.ts`)
2. **Collaborators come in.** A module is given its database, catalogue or reports, so a test can
   pass its own; only `createShop` wires them together. (`src/shop.ts`)
3. **Test at the seams.** Tests go through the shop over HTTP, on the test catalogue, and check
   what a visitor sees: text, links and status, not markup or internals. (`test/support/shop.ts`)
4. **One form inside.** Money is whole pence and dates are ISO strings until a page shows them;
   formatting happens once, at the edge. (`src/money.ts`)
5. **Nothing new to install.** The shop runs on Node's own modules, OpenTelemetry and pino for its
   telemetry, and for its feature flags OpenFeature's server SDK and flagd's provider with the
   gRPC client it needs (`@openfeature/server-sdk`, `@openfeature/flagd-provider`,
   `@grpc/grpc-js`) and what they bring with them (`@openfeature/core`, `@openfeature/flagd-core`,
   `json-logic-engine`, `lru-cache`, `object-hash`, `imurmurhash`, `semver`). Only `src/flags/`
   imports OpenFeature. Any other new runtime dependency, or a framework in disguise, is a finding.
   A reply to a request that asked about a flag is `cache-control: private, no-store`, whatever
   the flag's state, as `AGENTS.md` says: that is not a change to the page with the flag off.
6. **Only the ticket.** Hold the spec to the ticket as well as the diff to the spec. A criterion
   the ticket does not ask for is blocking, and goes to Martin; a change the spec does not ask
   for is blocking, and goes back to the coder.

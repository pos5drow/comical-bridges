# comical-bridge-atsumaru

A [Comical](https://github.com/comical) bridge for **atsu.moe** (atsumaru). Lives in its own repo.
Comical *sources* this repo as a registry; it ships nothing
site-specific itself.

## Status: local-link

This builds against a **sibling checkout of the Comical monorepo** (`../comical`), resolved via
`tsconfig.json` `paths`. Once `@comical/sdk` is published to npm, swap those paths for a normal
`bun add @comical/sdk` dependency and this becomes fully standalone.

```
../
├── comical/                  # the runtime monorepo (provides @comical/sdk, CLI, testkit)
└── comical-bridge-atsumaru/  # this repo
```

## Develop

```sh
bun run build       # → .build/atsumaru/dist/bridge.js  (CJS bundle)
bun run evaluate    # load the bundle through @comical/core + run the coverage evaluator (hits live atsu.moe)
ATSU_USER=you ATSU_PASS=… bun run evaluate   # also exercise favorites
```

## Publish a registry

Emits `index.json` + the served bundle at the repo root; commit them. Comical users then run
`comical registry add github.com/OWNER/comical-bridge-atsumaru`.

```sh
# optional: sign it
bun --cwd ../comical run cli registry keygen --out registry.key.json   # keep private

COMICAL_BASE_URL=https://raw.githubusercontent.com/OWNER/comical-bridge-atsumaru/main \
  COMICAL_KEY=registry.key.json \
  bun run publish:registry
```

`index.json` carries each bundle's URL + SHA-256 (+ Ed25519 signature if signed); Comical verifies on
install.

## Settings

- `adult` — show adult content.
- `username` / `password` — atsu.moe account, **only** needed for favorites; browsing works
  anonymously. Credentials are stored as secret settings by the host.

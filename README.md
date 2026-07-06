# comical-bridges

[Comical](https://github.com/comical) bridges, published as a registry. Lives in its own repo;
Comical *sources* it — the runtime ships nothing site-specific itself.

## Use this registry in the app

Point the app at this registry's `index.json`:

```
https://raw.githubusercontent.com/pos5drow/comical-bridges/master/index.json
```

Set it as `EXPO_PUBLIC_COMICAL_REGISTRY` in the app's gitignored
`apps/mobile/.env.local` (its value is run through `resolveRegistryUrl`, which passes a full
`…/index.json` URL through unchanged):

```sh
# comical-app/apps/mobile/.env.local
EXPO_PUBLIC_COMICAL_REGISTRY=https://raw.githubusercontent.com/pos5drow/comical-bridges/master/index.json
```

> Use the full `…/master/index.json` URL above — the `github.com/OWNER/REPO` shorthand resolves to
> the **`main`** branch, but this registry publishes on **`master`**.

For the desktop CLI instead: `comical registry add https://raw.githubusercontent.com/pos5drow/comical-bridges/master/index.json`.

## Status: local-link

This builds against a **sibling checkout of the Comical monorepo** (`../comical`), resolved via
`tsconfig.json` `paths`. Once `@comical/sdk` is published to npm, swap those paths for a normal
`bun add @comical/sdk` dependency and this becomes fully standalone.

```
../
├── comical/                  # the runtime monorepo (provides @comical/sdk, CLI, testkit)
└── comical-bridges/  # this repo
```

## Develop

```sh
bun run build       # → .build/atsumaru/dist/bridge.js  (CJS bundle)
bun run evaluate    # load the bundle through @comical/core + run the coverage evaluator (hits live atsu.moe)
ATSU_USER=you ATSU_PASS=… bun run evaluate   # also exercise favorites
```

## Publish a registry

Emits `index.json` + the served bundle at the repo root; commit them. Comical users then run
`comical registry add github.com/OWNER/comical-bridges`.

```sh
# optional: sign it
bun --cwd ../comical run cli registry keygen --out registry.key.json   # keep private

# base URL defaults to this repo's raw master; override only to publish elsewhere
COMICAL_BASE_URL=https://raw.githubusercontent.com/pos5drow/comical-bridges/master \
  COMICAL_KEY=registry.key.json \
  bun run publish:registry
```

`index.json` carries each bundle's URL + SHA-256 (+ Ed25519 signature if signed); Comical verifies on
install.

## Settings

- `adult` — show adult content.
- `username` / `password` — atsu.moe account, **only** needed for favorites; browsing works
  anonymously. Credentials are stored as secret settings by the host.

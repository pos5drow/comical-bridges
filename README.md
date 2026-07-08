# comical-bridges

Various comical bridges.

## Use this registry in the app

**One-click (if you already have the Comical app installed):**
[Add this registry to Comical](comical://add-registry?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpos5drow%2Fcomical-bridges%2Fmain%2Findex.json)

Or point the app at this registry's `index.json` manually:

```
https://raw.githubusercontent.com/pos5drow/comical-bridges/main/index.json
```

Set it as `EXPO_PUBLIC_COMICAL_REGISTRY` in the app's gitignored `apps/mobile/.env.local`. For the
desktop CLI: `comical registry add github.com/pos5drow/comical-bridges` (the shorthand resolves to
the default `main` branch).

## Develop

Builds against a **sibling checkout of the Comical monorepo** (`../comical`), resolved via
`tsconfig.json` `paths` — keep the two repos side by side:

```
../
├── comical/           # the runtime monorepo (provides @comical/sdk, CLI, testkit)
└── comical-bridges/   # this repo
```

```sh
bun install
bun run build       # build every bridge → .build/<id>/dist/bridge.js  (CJS bundles)
bun test            # unit tests (test/*.test.ts)
bun run evaluate    # load the atsumaru bundle through @comical/core + run the coverage evaluator (hits live atsu.moe)
ATSU_USER=you ATSU_PASS=… bun run evaluate   # also exercise atsumaru favorites
```

# comical-bridges

Various comical bridges, published as a registry the app can source.

## Use this registry in the app

**One-click (if you already have the Comical app installed):**
[Add the registry](https://porksphere.github.io/comical-app/add-registry?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpos5drow%2Fcomical-bridges%2Fmain%2Findex.json)

Or point the app at the `index.json` manually:

```
https://raw.githubusercontent.com/pos5drow/comical-bridges/main/index.json
```

Set it as `EXPO_PUBLIC_COMICAL_REGISTRY` in the app's gitignored `apps/mobile/.env.local` (dev
pre-adds a single registry). For the desktop CLI:
`comical registry add https://raw.githubusercontent.com/pos5drow/comical-bridges/main/index.json`.

## Status

Live conformance + cover-size metrics, refreshed nightly by [`audit.ts`](audit.ts) (the shared
`@comical/testkit` evaluator run against each real backend). ⚠ = warnings only or a tolerated
flaky/blocked site; ✗ = a real regression; ⊘ = skipped (auth-gated with no credentials, or an
inconclusive sort/filter probe — never counted against a bridge). Per-check results are in
**[`AUDIT.md`](AUDIT.md)**; flaky tags are in [`audit.config.ts`](audit.config.ts).

<!-- BRIDGE-STATUS:START -->
| Bridge | Status | Capabilities | Avg cover | Notes |
|---|---|---|---|---|
| `atsumaru` | ✓ (15✓ 0⚠ 0✗ 1⊘) | 6/7 | 48 KB (360×540) | — |
| `weebcentral` | ✓ (13✓ 0⚠ 0✗ 1⊘) | 4/4 | 19 KB (200×300) | — |
| `mangadex` | ⚠ (10✓ 1⚠ 0✗) | 3/3 | 50 KB (256×376) | Cloudflare challenges datacenter (runner) IPs |

_Updated 2026-08-29 by the nightly live audit ([`audit.ts`](audit.ts))._
<!-- BRIDGE-STATUS:END -->

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

Publishing is CI's job (`.github/workflows/publish.yml`, on any push touching `src/`) — it holds the
signing key as a repo secret and refuses to publish unsigned. **Don't commit a locally built
registry.** Bun stamps each module's path into the bundle as a comment, so the bytes (and therefore
the SHA-256 clients verify) depend on where the repo sits on disk — a local publish and CI's publish
of identical sources disagree, and the next CI run refuses to overwrite its own bundles. Let CI do
it; the runner's Bun version is pinned so its output only moves when someone means it to.

Regenerating locally is still fine for *inspecting* the output — you need the key at
`registry.key.json` (gitignored) — just don't commit the result:

```sh
COMICAL_KEY=registry.key.json bun run publish:registry
```

# comical-bridges

Various comical bridges.

## Use these registries in the app

This repo publishes **two separate registries** — one SFW, one NSFW — so you can add only what you
want. Adding just the SFW registry means the NSFW bridges are never even listed.

**One-click (if you already have the Comical app installed):**
- [Add the SFW registry](https://porksphere.github.io/comical-app/add-registry?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpos5drow%2Fcomical-bridges%2Fmain%2Fsfw%2Findex.json)
- [Add the NSFW registry](https://porksphere.github.io/comical-app/add-registry?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpos5drow%2Fcomical-bridges%2Fmain%2Fnsfw%2Findex.json)

Or point the app at a registry's `index.json` manually:

```
SFW:  https://raw.githubusercontent.com/pos5drow/comical-bridges/main/sfw/index.json
NSFW: https://raw.githubusercontent.com/pos5drow/comical-bridges/main/nsfw/index.json
```

Set one as `EXPO_PUBLIC_COMICAL_REGISTRY` in the app's gitignored `apps/mobile/.env.local` (dev
pre-adds a single registry). For the desktop CLI, add either URL:
`comical registry add https://raw.githubusercontent.com/pos5drow/comical-bridges/main/sfw/index.json`.

## Status

Live conformance + cover-size metrics, refreshed nightly by [`audit.ts`](audit.ts) (the shared
`@comical/testkit` evaluator run against each real backend). ⚠ = warnings only or a tolerated
flaky/blocked site; ✗ = a real regression; ⊘ = skipped (auth-gated with no credentials, or an
inconclusive sort/filter probe — never counted against a bridge). Per-check results are in
**[`AUDIT.md`](AUDIT.md)**; flaky tags are in [`audit.config.ts`](audit.config.ts).

<!-- BRIDGE-STATUS:START -->
| Bridge | Status | Capabilities | Avg cover | Notes |
|---|---|---|---|---|
| `atsumaru` | ✓ (13✓ 0⚠ 0✗ 1⊘) | 6/7 | 54 KB (360×540) | — |
| `weebcentral` | ✓ (11✓ 0⚠ 0✗ 1⊘) | 4/4 | 17 KB (200×300) | — |
| `mangadex` | ⚠ (8✓ 1⚠ 0✗) | 3/3 | 51 KB (256×376) | Cloudflare challenges datacenter (runner) IPs |
| `nhentai` | ⚠ (11✓ 2⚠ 0✗ 2⊘) | 7/10 | 29 KB (500×722) | Cloudflare / IP-gated from datacenters |
| `e-hentai` | ⚠ (10✓ 3⚠ 0✗ 1⊘) | 6/6 | 24 KB (245×332) | sad-panda / IP + cookie gated from datacenters |
| `hitomi` | ⚠ (9✓ 3⚠ 0✗ 2⊘) | 5/6 | — | images need the host /img-proxy (Referer-gated), unavailable in the audit |

_Updated 2026-07-24 by the nightly live audit ([`audit.ts`](audit.ts))._
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

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
| `atsumaru` | ⚠ (5✓ 6⚠ 0✗) | 6/7 | — | — |
| `weebcentral` | ⚠ (4✓ 5⚠ 0✗) | 4/4 | — | — |
| `mangadex` | ⚠ (10✓ 1⚠ 0✗) | 3/3 | 50 KB (256×376) | Cloudflare challenges datacenter (runner) IPs |
| `mangakakalot` | ⚠ (5✓ 4⚠ 1✗) | 5/5 | — | flaky (tolerated): search is challenged by Cloudflare bot scoring |
| `manganato` | ⚠ (8✓ 4⚠ 0✗) | 5/5 | 33 KB (289×415) | search is challenged by Cloudflare bot scoring |
| `mangabat` | ✓ (13✓ 0⚠ 0✗ 2⊘) | 5/5 | 33 KB (289×415) | search is challenged by Cloudflare bot scoring |
| `asurascans` | ✓ (14✓ 0⚠ 0✗) | 4/5 | 180 KB (843×1231) | — |
| `olympus` | ⚠ (4✓ 5⚠ 0✗) | 5/5 | — | — |
| `manhwaweb` | ✓ (14✓ 0⚠ 0✗) | 4/5 | 132 KB (665×911) | — |
| `mangak` | ✓ (13✓ 0⚠ 0✗ 1⊘) | 4/5 | 12 KB (202×254) | — |
| `toonilyme` | ✓ (13✓ 0⚠ 0✗ 1⊘) | 4/5 | 14 KB (208×300) | — |
| `mangataro` | ⚠ (10✓ 2⚠ 0✗ 2⊘) | 4/4 | 545 KB (1149×1474) | — |
| `roliascan` | ⚠ (12✓ 1⚠ 0✗) | 4/4 | 748 KB (559×772) | — |
| `kingofshojo` | ⚠ (13✓ 1⚠ 0✗ 1⊘) | 4/4 | 124 KB (600×1000) | — |
| `flamecomics` | ⚠ (2✓ 4⚠ 0✗) | 3/3 | — | — |
| `mangaball` | ⚠ (5✓ 5⚠ 0✗) | 5/6 | — | — |
| `dynasty` | ⚠ (12✓ 3⚠ 0✗) | 3/3 | — | — |
| `webtoons` | ✓ (13✓ 0⚠ 0✗) | 4/5 | 80 KB (480×623) | — |
| `zonatmo` | ⚠ (4✓ 5⚠ 0✗) | 4/5 | — | — |
| `batcave` | ⚠ (4✓ 5⚠ 0✗) | 4/4 | — | DLE Guard wants a browser check first |
| `kagane` | ⚠ (5✓ 5⚠ 0✗) | 5/6 | — | Cloudflare check needs a browser |
| `onisaga` | ⚠ (5✓ 5⚠ 0✗) | 5/6 | — | Cloudflare check needs a browser |
| `mangadot` | ✓ (15✓ 0⚠ 0✗) | 5/6 | 120 KB (742×1078) | Cloudflare check needs a browser |
| `lectorxd` | ⚠ (10✓ 1⚠ 0✗ 1⊘) | 4/4 | — | Cloudflare check on series and reader pages needs a browser |
| `mangaplus` | ✓ (13✓ 0⚠ 0✗) | 4/4 | 25 KB (352×528) | — |
| `toonkotsu` | ⚠ (4✓ 5⚠ 0✗) | 4/5 | — | Cloudflare challenges the Bun/Node TLS fingerprint |
| `mangago` | ⚠ (5✓ 5⚠ 0✗) | 5/6 | — | Cloudflare challenges the Bun/Node TLS fingerprint |
| `mangafire` | ⚠ (5✓ 5⚠ 0✗) | 5/6 | — | — |
| `cubari` | ⚠ (6✓ 1⚠ 0✗) | 1/1 | 30 KB (400×600) | — |

_Updated 2026-11-21 by the nightly live audit ([`audit.ts`](audit.ts))._
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

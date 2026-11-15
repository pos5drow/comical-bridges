# Shared engines: should bridges share code?

An investigation for the roadmap push (about 40 new bridges across this repo and
`comical-bridges-nsfw`). Short answer: **yes, share code, but never share a bridge.** Every site stays
its own bridge with its own id, version and `BridgeInfo`. Code is shared at build time, as source
modules that `Bun.build` inlines into each bundle.

## Option A: one "multi-site" bridge (rejected)

This is one bridge with a "which site?" setting, or one bridge that serves several sites.

- **Identity breaks.** Library entries, progress and downloads are keyed by bridge id plus series
  id. If the site lives in a setting, changing the setting swaps the catalogue under the same id, so
  the host and `migrateIds` can't tell the sites apart.
- **`BridgeInfo` is per site.** `rateLimit`, `assetRateLimit`, `images.hosts`, `linkHosts`,
  `iconUrl`, `languages` and `nsfw` all differ by site. A merged bridge would declare the union,
  which is wrong for each site.
- **One break taxes every site.** Bundles are immutable per version, so fixing one site means
  shipping a new version for all of them, and the audit would report one status for N sites.
- **It doesn't match the app.** Users pick sources, and the registry lists sources.

## Option B: shared source modules, one bridge per site (recommended)

```
src/
  core/        plumbing every bridge may use (no site knowledge)
  engines/     one module per site template: mangabox.ts, madtheme.ts, mangataro.ts, …
  <site>.ts    a bridge: either bespoke, or ~20–40 lines configuring an engine
```

The **engine** is an abstract `BridgeBase` subclass that holds the template's selectors, URL
shapes, list/filter/sort definitions and parsing. A **site file** subclasses it with data, plus
overrides only where the site deviates:

```ts
// src/manganato.ts
class Manganato extends MangaBoxEngine {
  readonly info = mangaboxInfo({ id: "pos5drow.manganato", name: "Manganato", version: "0.1.0", … });
  protected readonly mirrors = ["https://www.natomanga.com", "https://www.manganato.gg", "https://www.nelomanga.net"];
}
export default defineBridge((host) => new Manganato(host));
```

This matches the decision already made for the self-hosted repo (`src/core/` shared plumbing,
inlined per bridge), so the two bridge sets end up with the same structure.

### Where it pays off

Engine sharing among the roadmap targets (the engine names are Keiyoushi's `lib-multisrc`
themes):

| Engine | Roadmap bridges | Other sites on it (Keiyoushi count) | Verdict |
|---|---|---|---|
| mangabox | Mangakakalot, Manganato, Mangabat | 3 | **build**: 3 bridges, and mirrors are part of its design |
| mangak (MadTheme) | MangaK, Toonily.me | 3 | **build** |
| mangataro | MangaTaro, Rolia Scan | 2 | **build** |
| galleryadults *(nsfw)* | IMHentai, HentaiFox | 11 | **build**: about 9 more sites nearly free |
| kemono *(nsfw)* | Kemono, Coomer (maybe Pawchive) | 2 | **build** |
| mangathemesia | King of Shojo | **115** | **build**, with KoS as the first user: it's the long-tail engine for scanlator sites |
| madara | (none on the roadmap) | **242** | later: the biggest long-tail engine, worth doing once the roadmap is done |

Everything else on the roadmap (Comix, Asura, MangaFire, Kagane, Mangago, Olympus, …) is
bespoke. Every other app treats them the same way.

### Shared plumbing (`src/core/`)

These are already written once per bridge, or are about to be needed by most new ones:

- **Challenge detection.** `cf-mitigated` handling and "a challenge is a hold, not a parse error"
  live separately in `weebcentral.ts`, `bridge.ts` (atsumaru) and the nsfw repo's `ehentai.ts`. One
  `request()` wrapper should turn challenges, 429s and 503s into `rateLimitedMessage` errors.
- **Mirrors and domain moves.** A mirror list plus a `domain` setting, and a check for a redirect
  to a new host so a domain move becomes a clear error rather than silent garbage. Asura, Kagane,
  MangaFire and Manga Livre all moved domains in 2026.
- **Parsing helpers.** Relative dates ("3 hours ago", in several languages since the Spanish sources
  need it), chapter numbers from titles, a status map, and series-gone detection.
- **Cover hints.** `cover-hints.ts` already exists in both repos with different tables. Keep one per
  repo, or move the shared base into core.

**Across the two repos (proposal, 2026-11-14):** Comical must stay agnostic, with no website or
vendor knowledge in it. The split is three layers:

| Layer | Lives in | Knows about | Contents |
|---|---|---|---|
| Mechanism | `porksphere/comical` (exists, no change needed) | HTTP and the contract only | error vocabulary (`rateLimitedMessage`, `loginRequiredMessage`, `seriesGoneMessage`); the gated network already turns generic 429/503 + `Retry-After` into back-off; `BridgeBase.request()` is the override point |
| Scraping kit | new `pos5drow/comical-bridge-kit`, **zero `@comical/*` imports** | web infrastructure (Cloudflare, DDoS-Guard), date formats, mirror lists, but no specific site | response guards that return plain verdicts (`{kind:"challenge", retryMs, reason}`), domain-move detection, relative dates, chapter-number and status parsing |
| Sites | `comical-bridges`, `comical-bridges-nsfw` | specific sites | engines (`src/engines/`), bridges, and a ~10-line `src/core/guarded.ts` adapter mapping kit verdicts to Comical errors inside `request()` |

The kit is consumed as a git dependency **pinned to a commit**
(`github:pos5drow/comical-bridge-kit#<sha>`, locked in `bun.lock`), so bundle bytes only change on a
deliberate bump, and a kit bump bumps the bridges it touches (same rule as engines). Because the kit
has no Comical imports, it is agnostic in both directions and testable on its own.

### The cost: immutable versions

Published bundles are immutable per version: the registry refuses "same version, different
bytes". So **a change to an engine or to core changes the bytes of every bridge built from it,
and all of them need a version bump in the same commit**, or CI's publish fails. That's the
intended trade, since a template fix should ship to every site, but it needs tooling:

- `build.ts` discovers bridges and records which engine each one uses.
- A `bump.ts --engine mangabox` (or `--changed`) script bumps the patch version of every affected
  bridge.
- A CI check fails fast with "these bridges' bytes changed without a version bump: …" before the
  publish step, rather than surfacing as a publish refusal.

### Tests per engine

Each engine gets one parser test suite driven by recorded fixtures (testkit cassettes) from at
least one site. Each site adds only its own audit entry (`audit.config.ts`), plus fixtures where it
deviates. A template change across many sites then shows up as one engine failure rather than N
unrelated ones.

## Contract gaps

The roadmap is blocked in two places by things a bridge can't do today. Both are changes in
`porksphere/comical` (contract plus the native hosts), so they need a decision there.

### Image transforms (IMG-TILES, IMG-BYTES, IMG-RESP)

| Need | Sources | When the parameters are known |
|---|---|---|
| tile-grid reassembly | Asura (Tier 1), Mangago, Comix (5×5) | page-list time (Asura); response headers (Comix) |
| strip reorder | JMComic | page-list time (computed from ids) |
| byte XOR | MANGA Plus, Comix | page-list time (MANGA Plus); response headers (Comix) |
| byte AES-CTR | Toonkotsu | page-list time (key in the URL) |

The contract has nothing for this: `Page` is `imageUrl` + `headers` + `thumbnail`, and
`interceptImageRequest` only rewrites the request. The first sketch, written before tracing where
image bytes flow, followed "presentation is data" and mirrored `PageThumbnail`'s `sprite` variant.
The options below replace it.

- **Pixel transforms as data.** An optional `Page.transform` (discriminated union, e.g.
  `{kind:"tiles", cols, rows, order}` / `{kind:"strips", order}`) that each client applies
  natively (canvas or SVG on web, `BitmapRegionDecoder`/`CGImage` crops on native). The host does no
  image work, and downloads store the original bytes plus the descriptor.
- **Byte transforms** are simpler and don't need a decoder: either a data variant
  (`{kind:"xor", key}`, `{kind:"aes-ctr", key, nonce}`) the host applies to the bytes, or a bridge
  hook that receives the bytes.
- **Response-time parameters** (Comix only) need a hook that sees the image response headers and
  returns the descriptor. Comix is the only source that needs it, so it can be designed last.

Asura alone justifies tiles, and it's Tier 1, so this is on the critical path.

### JS solvers (JS-SOLVER)

MangaFire (VRF token), Comix (request signer), and possibly MangaDot, BatCave, HDoujin, Schale
Network and wnacg: Keiyoushi runs each site's own JS in a hidden WebView. The options, cheapest
first, decided per source:

1. **Port the algorithm to TypeScript.** Often feasible: the bridge already runs as JS, and Kotlin
   needs a WebView only because it can't run JS natively.
2. **Use the existing cookie-capture `browser` setting** where the hurdle is really a Cloudflare
   clearance cookie.
3. **Add a new host capability** ("evaluate this page in a headless browser"). This is the most
   expensive option: every host has to implement it, which goes against "keep host integration
   minimal". Treat it as a last resort.

Each JS-SOLVER source in the roadmap needs a short investigation to find out which of the three
applies.

### Where image bytes already flow (found 2026-11-14)

Any image on a host that needs headers or interception is rewritten to the image route
(`/bridges/:id/image?url=…`, `core/src/images.ts`). That route **already handles the bytes in every
mode**. In remote mode, host-server proxies them. In embedded mode (on device), the app's
`resolveAssetSource` (`comical-app/apps/mobile/src/data/api.ts`) pulls them through the in-process
transport and hands `<Image>` a `data:` URI. So a decode step in that route reaches every reader
surface, and probably downloads too (verify), without touching any client.

Options for the pixel transforms (tiles and strips):

- **A. Descriptor rendered by the client** (the `sprite` precedent). This follows the design
  principle as written, but every page surface would have to composite tiles: paged and webtoon
  readers, zoom, spreads, the start poster, page thumbnails, page favorites and crops, and
  save/share, on web, iOS and Android. Seams are a real risk: `SpriteCrop` is an overflow-clipped
  `<Image>` that already fought a native rounding hairline. It also can't handle Comix, whose
  parameters arrive in response headers.
- **B. Reassemble in the image route through one narrow host operation**: `reassemble(bytes, {grid
  or strips, order})` → image bytes, implemented natively (Kotlin `Bitmap`, Swift `CGImage`, an
  image library in host-server, canvas on web). Every surface then sees a normal image, and Comix's
  response-header parameters come for free because the route sees the response. The costs: four
  implementations, a lossy re-encode (or a larger PNG), and an explicit exception to "the host does
  no image work".
- **C. Don't support scrambled sources.** That drops Asura, Mangago, Comix and JMComic.
- **A′. Descriptor as data, applied once by the client where it resolves assets (preferred,
  2026-11-14).** The bridge emits a tile/strip descriptor on the `Page`, the `sprite` precedent from
  E-Hentai. The app applies it in **one** place, `resolveAssetSource`, which on device already holds
  the bytes, using Skia (`@shopify/react-native-skia`, already a dependency: `gutter-colors.ts`
  decodes and reads pixels with it) or a canvas on web. Every reader surface (page curl shader,
  gutter colours, slicing, spreads, zoom) then gets one ordinary bitmap. No host or native-context
  changes, and it stays within "presentation is data". Open points:
  - Remote mode currently hands `<Image>` a URL rather than bytes, so it needs a fetch path for
    tiled pages.
  - Downloads: store the original bytes plus the descriptor, or store the unscrambled image?
  - Comix's response-header parameters need the image route to pass them on. Do Comix last.

  Why A (per-surface compositing) is worse than it looks: `page-curl` draws the page as a texture,
  `gutter-colors` samples its pixels, and `use-sliced-page` slices it. All of them assume one
  bitmap.

Byte transforms (XOR, AES-CTR) are cheap either way: pure JS in core's image route, declared as
data by the bridge. No platform API is needed, so no host changes.

### Final design: processed page images (2026-11-15)

A′ was superseded by the shape Aidoku and Kotatsu use: **logic in the bridge, pixels in the
client**. It's in comical `d79f8fc` (pushed). The app side is on the local `page-scramble` branch in
the `comical-app-scramble` worktree, not pushed.

- A bridge marks a page `Page.process` (optional `context`) and declares
  `images.process: { bytes?, layout? }`.
- `decodePageImage({ url, headers, context })` returns byte transforms as data (`xor`, `aes-ctr`),
  which core runs in plain JS. A keystream generated from a seed is just an `xor` key as long as
  the range it covers.
- `layoutPageImage({ url, width, height, headers, context })` returns `{ width, height, ops }`
  with `copy` operations. `@comical/sdk`'s `tileLayout` / `stripLayout` cover grids and strips.
- The image route serves the decoded bytes plus a `Comical-Page-Layout` header. The app draws
  the layout once in `resolveAssetSource`. Downloads store the layout, and a downloaded page's
  file is served with it.
- Because the hooks see the **response headers**, this covers sources whose order arrives with
  the image (IMG-RESP), as well as byte encryption (IMG-BYTES) and tiles/strips (IMG-TILES).
  All three blocker codes are closed in principle; each still needs its bridge written.
- Known gaps: hub-served downloads aren't marked (the hub only knows page counts), the remote
  index learns `processed` at hydration only, and none of it has run on a device yet.

## Decisions

1. ~~Option B: one bridge per site, with shared engines and core~~ **adopted 2026-11-14.**
2. Shared helpers: the three-layer split above (Comical unchanged, a pinned standalone kit, sites
   in the bridge repos). Proposed, awaiting a yes.
3. ~~Pixel transforms~~ **decided 2026-11-15:** processed page images (above).

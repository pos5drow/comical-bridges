# Source roadmap

The bridges we plan to add to this repo, why they made the list, and where each one stands. NSFW
targets are tracked separately in `comical-bridges-nsfw/docs/roadmap.md`. Self-hosted servers (OPDS,
Komga, Kavita, Suwayomi, LANraragi) are out of scope here — they live in their own repo.

Related: [`shared-engines.md`](shared-engines.md) (how to build this many bridges without copying
code) · [`maintenance.md`](maintenance.md) (how to keep them working once they exist).

**Update this file in the same commit that changes a bridge's status.**

## How the list was picked (survey, 2026-11-14)

Demand was measured four ways and a source made the list when several agreed:

- **Traffic** — Similarweb "Animation & Comics" category ranking, October 2026 (anime/novel sites
  ignored). Rank shown as `#n` below.
- **What other apps ship** — Keiyoushi (the Mihon/Tachiyomi-fork extension repo), Aidoku Community
  sources, Kotatsu parsers.
- **User demand** — Keiyoushi GitHub issues by 👍: source requests, and "broken" reports (a source
  people complain about loudly is a source people use).
- **Curation** — EverythingMoe's manga-reading list.

Already shipped and well-chosen by every measure: MangaDex (#10), Weeb Central (#18), Atsumaru.

Dead, don't build: Bato.to (shut down Jan 2026), TuMangaOnline (taken down Apr 2026), MangaSee
(became Weeb Central).

## Status legend

`todo` · `wip` · `blocked` (see Blockers) · `shipped <version>` · `dropped` (say why)

## Blockers referenced below

Capabilities the Comical contract didn't have. IMG-TILES, IMG-BYTES and IMG-RESP are now covered by
processed page images (comical `d79f8fc`, see `shared-engines.md` § Final design). The app half
isn't merged yet, and no bridge uses it yet.

- **IMG-TILES** — page images arrive as a shuffled tile grid; the reader must reassemble them.
- **IMG-BYTES** — page image bytes are XOR'd/AES-encrypted and must be decoded before display.
- **IMG-RESP** — the descramble parameters only arrive in the image *response* headers, so the page
  list can't carry them (Comix).
- **CF-CLEARANCE** — some routes sit behind Cloudflare bot scoring and get challenged at random,
  e.g. MangaBox search. Keiyoushi solves these in a WebView; Comical has no clearance flow yet, so
  the bridge surfaces a back-off error. This cuts across many sources and needs a host/app answer
  (a cookie-capture flow for `cf_clearance`, which is tied to the User-Agent and IP).
- **JS-SOLVER** — the site needs a token computed by its own obfuscated JS; Keiyoushi runs it in a
  hidden WebView. Each needs investigating: a pure-JS port, the cookie-capture `browser` setting, or
  a new host capability.

## Tier 1

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Comix | comix.to (+ comix.ws) | bespoke | kei `en/comix` (2.2k LOC), aidoku `en.comix` | #2; top of EverythingMoe; most-👍 Keiyoushi issue of 2026 (163) | IMG-RESP (XOR + 5×5 grid), JS-SOLVER (request signer) | todo |
| Asura Scans | asurascans.com (JSON API at api.asurascans.com) | bespoke | kei `en/asurascans`, aidoku `en.asurascans` | #3; in every app | only premium pages are tiled, and premium needs a paid account (login not built) | shipped `0.1.1`: free chapters; tiled pages processed if served |
| MangaFire | mangafire.to | bespoke | kei `all/mangafire`, aidoku `multi.mangafire` | #9; 65 & 53 👍 breakage issues | JS-SOLVER (VRF token) | todo |
| Mangakakalot | kakamanga.com (mangakakalot.gg redirects there), mangakakalove.com | **mangabox** | kei `en/mangakakalot`, aidoku `en.mangakakalot` | #40 | CF-CLEARANCE (search only) | shipped `0.1.2` (read path ✓; search challenged by Cloudflare at times) |
| Manganato | manganato.gg (default), natomanga.com (now redirects to manganami.com), nelomanga.net | **mangabox** | kei `en/manganelo`, aidoku `en.manganato` | #43 | CF-CLEARANCE (search only) | shipped `0.1.2` (read path ✓; search challenged by Cloudflare at times) |
| Mangabat | mangabats.com | **mangabox** | kei `en/mangabat`, aidoku `en.mangabat` | — | CF-CLEARANCE (search, intermittent) | shipped `0.1.2` |
| Kagane | kagane.moe/.cx/.net (kagane.to is gone) | bespoke | kei `all/kagane`, aidoku `multi.kagane` | 69 & 52 👍 | **CF-CLEARANCE on every endpoint** (API included, even from a home IP); pages are JPEG XL, which Android cannot decode by default | blocked |

## Tier 2

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Mangago | mangago.me | bespoke | kei `en/mangago`, aidoku `en.mangago` | #12 | IMG-TILES + encrypted image list | todo |
| King of Shojo | kingofshojo.com | **mangathemesia** | kei `en/kingofshojo`, aidoku `en.kingofshojo` | #21 | — | shipped `0.1.0` (first site on the long-tail engine) |
| Flame Comics | flamecomics.xyz | bespoke (Next.js data routes) | kei `en/flamecomics`, aidoku `en.flamecomics` | in every app | — | shipped `0.1.0` |
| MangaK (ex-MangaBuddy) | mangak.io (API at api.mangak.io) | **madtheme** | kei `en/mangabuddy`, aidoku `en.mangak` | #44 | — | shipped `0.1.1` |
| Toonily.me | toontop.io (API at api.toontop.io) | **madtheme** | kei `en/toonilyme`, aidoku `en.toonilyme` | — | — | shipped `0.1.1` |
| MangaTaro | mangataro.org | **mangataro** | kei `en/mangataro` | 27 👍 request | many top licensed titles are taken down on the site (shown as such); English chapters only | shipped `0.1.0` |
| Rolia Scan | roliascan.com | **mangataro** | kei `en/roliascan` | #19 — *added: nearly free once the MangaTaro engine exists* | — | shipped `0.1.0` |
| Toonkotsu | toonkotsu.com | bespoke | kei `en/toonkotsu`, aidoku `en.toonkotsu` | EverythingMoe "new" | IMG-BYTES (AES-CTR, key in the URL) | todo |
| OniSaga | onisaga.com | bespoke (RPC + Next.js) | kei `all/onisaga` | 16 👍 request | **CF-CLEARANCE site-wide** | blocked |
| Manga Ball | mangaball.com | bespoke (API, multilingual) | kei `all/mangaball`, aidoku `multi.mangaball` | 15 👍 request | — | shipped `0.1.0` (one bridge; Language setting) |
| MangaDot | mangadot.net | bespoke | kei `all/mangadotnet`, aidoku `multi.mangadotnet` | EverythingMoe hub | JS-SOLVER? (kei uses a WebView — investigate) | todo |
| Webtoons | webtoons.com | bespoke (official) | kei `all/webtoons`, aidoku `multi.webtoon` | #26 | — (kei's bitmap code is optional page merging) | todo |
| MANGA Plus | mangaplus.shueisha.co.jp | bespoke (official, protobuf API) | kei `all/mangaplus`, aidoku `multi.mangaplus` | in every app | IMG-BYTES (XOR key per page, known at page-list time) | todo |
| Cubari | cubari.moe | bespoke (proxy for imgur/GitHub galleries) | kei `all/cubari`, aidoku `multi.cubari` | in every app | no catalogue (Keiyoushi lists a WebView history); MangaDex-backed links can fail upstream | shipped `0.1.0` (search = paste a link) |
| Dynasty Scans | dynasty-scans.com | bespoke (JSON) | kei `en/dynasty`, aidoku `en.dynastyscans` | yuri hub | — | todo |
| BatCave | batcave.biz | bespoke (western comics) | kei `en/batcave`, aidoku `en.batcave` | #38 | JS-SOLVER? (kei uses a WebView — investigate) | todo |
| ReadComicOnline | readcomiconline.li | bespoke (western comics) | none current (dropped by Keiyoushi) | users keep asking; breaks often | obfuscated image URLs — investigate; do last | todo |

## Spanish

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Olympus Scanlation | olympusxyz.com (found via the olympus.pages.dev redirector) | bespoke (API) | kei `es/olympusscanlation`, aidoku `es.olympusscanlation` | #4 | — | shipped `0.1.1` |
| ManhwaWeb | manhwaweb.com (API at api.manhwaweb.com) | bespoke (API) | kei `es/manhwaweb`, aidoku `es.manhwaweb` | #5 | — | shipped `0.1.1` (adult series rated `adult`) |
| LectorXD | lectorxd.com | bespoke | kei `es/lectorxd` | #23 (+32 places in a month) | — | todo |
| ZonaTMO | zonatmo.org (+ zonatmo.to) | bespoke (TMO clone) | kei `es/zonatmoorgunoriginal`, `es/zonatmoto` | #37; fills the TuMangaOnline gap | domain churn, so plan for mirrors | todo |

## Blocked or partly blocked: what would unblock them

Revisit at the end. Each entry says what is missing and where the work would go: **bridge** (this
repo), **comical** (contract/core/host), or **app** (comical-app).

| Source | State | What's missing | What would unblock it |
|---|---|---|---|
| Kagane | blocked | 1. Every endpoint, API included, answers a Cloudflare managed challenge, even from a home IP. 2. Pages are JPEG XL (`.jxl`), which Android's image stack (Glide) can't decode; iOS 17+ can. | 1. **CF-CLEARANCE** (below). 2. **app:** a JPEG XL decoder on Android, or test whether the `datasaver` page variant is served as WebP. Then the bridge needs integrity + per-book page tokens, both plain API calls. |
| OniSaga | blocked | Every page and the RPC API answer a Cloudflare managed challenge (checked 2026-11-15 from a home IP). | **CF-CLEARANCE** (below). After that: a cursor-paged catalog RPC, server-rendered title pages (ld+json, chapter pages paginated), Next.js reader data, and an age gate for adult titles (a form POST setting `__Host-onisaga.age_confirmed`, then `account/titleView` / `readerView` RPCs). |
| Mangakakalot, Manganato, Mangabat | shipped, search partly blocked | Search (`/search/story/…`) is challenged by Cloudflare bot scoring at random; browse, details and reading work. | **CF-CLEARANCE** (below). Nothing else. |
| Asura Scans | shipped, premium not readable | Premium and early-access chapters need a paid account; without one the API returns no pages, so they are hidden. | **bridge:** sign-in (`web-login` setting capturing the `access_token` cookie), then the premium endpoint with `Authorization` + `X-Page-Token`; its pages arrive tiled and are already handled by processed page images. Needs a subscriber account to build and verify. |
| MangaTaro | shipped, partly empty | Some titles only have non-English (pt-br) chapters, and many popular licensed titles are taken down ("Chapter not available"). | Takedowns: nothing to do. Languages: **bridge** could declare the other languages and tag chapters with `languageCode`. |
| Comix | not started | 1. Requests are signed by the site's own obfuscated JS (Keiyoushi runs it in a WebView). 2. Images are XOR'd and grid-scrambled, with the parameters in the response headers. | 1. **JS-SOLVER** investigation: port the signer to TypeScript if feasible. 2. Already covered by processed page images (`decodePageImage` reads the headers, `layoutPageImage` the grid). |
| MangaFire | not started | A VRF token computed by the site's JS (Keiyoushi uses a WebView solver page). | **JS-SOLVER**: port the VRF algorithm to TypeScript. |
| MangaDot, BatCave | not started | Keiyoushi uses a WebView for something; not yet investigated. | **JS-SOLVER** investigation; may turn out to be only a Cloudflare cookie. |
| ReadComicOnline | not started | Obfuscated image URLs; Keiyoushi dropped the source. | Investigate once everything else is done. |

**Cross-cutting: CF-CLEARANCE.** Comical has no way to pass a Cloudflare challenge. Keiyoushi opens
the site in a WebView, lets the challenge run, and reuses the `cf_clearance` cookie, which is bound
to the browser's User-Agent and IP. What it would take:
- **comical:** a way for a bridge to say "this site needs clearance". This could be a setting kind
  like `web-login` (open the site, wait for `cf_clearance`, store the cookie), or a host-level
  handler that reacts to the challenge error the guard already raises.
- **host:** send that cookie, and the same User-Agent the browser used, on the bridge's requests.
- **app:** the web-view sheet, reusing what `web-login` already does.

## Notes from building

- **MangaBox (2026-11-14):** the three sites are one catalogue on one CDN (`*.2xstorage.com`) with
  identical markup and API, so the site files are pure config. Images and covers need a Referer
  from a site domain (declared in `BridgeInfo.images`). The testkit's cover sampler fetches without
  that Referer, so the audit reports covers as failed even though the app loads them: a testkit
  follow-up in `porksphere/comical`.

- **Asura Scans (2026-11-15):** the whole site is a JSON API, with no scraping. Tiles appear only on
  premium chapters (paid), and a premium chapter without an account comes back with no pages, so
  free reading needs no processing. The bridge marks tiled pages anyway. Asura is **not** a test of
  processed images: that needs a source whose public pages are scrambled.

- **MadTheme (2026-11-15):** now a full JSON API at `api.<host>` (search, details, chapters, pages
  by short id), so no scraping. Images sit on rotating `rx.qvzr?.org` hosts that need the site's
  Referer, all 26 declared. Chapter `number` from the API is a list position, so the number is
  parsed from the name. Adult titles are rated via `is_adult` / `content_rating`.

- **MangaTaro (2026-11-15):** WordPress plus custom endpoints. The chapter list needs an MD5 token
  tied to the server clock (kit gained `md5`; a 403 is retried once against the Date header). Many
  of MangaTaro's most popular titles have chapters taken down ("Chapter not available"), so its
  lists open on Latest. It's multilingual: some titles have only Portuguese chapters and show none.
- **Kit updates no longer re-version bridges (2026-11-15):** Bun's `//# debugId=` hashes every
  source it read, including tree-shaken ones, so build.ts drops it. Builds are now byte-identical
  across kit pins for bridges that don't use the changed code.

## Suggested build order

1. **Unblocked, high demand:** MangaBox engine (3 bridges) → Kagane → Olympus → ManhwaWeb.
2. **Engines that pay off:** MadTheme (2) → MangaTaro (2) → MangaThemesia (King of Shojo).
3. **Unblocked bespoke:** Flame, Manga Ball, OniSaga, Cubari, Dynasty, Webtoons, LectorXD, ZonaTMO.
4. **After the contract gaps close:** Asura (IMG-TILES) → MANGA Plus, Toonkotsu (IMG-BYTES) → Mangago
   → Comix (IMG-RESP + solver).
5. **After the JS-SOLVER investigations:** MangaFire, MangaDot, BatCave, then ReadComicOnline.

Asura is Tier 1 but waits on IMG-TILES, so the contract work is on the critical path. Start it in
parallel with step 1.

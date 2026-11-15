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
processed page images (comical `dd49ca4`, see `shared-engines.md` § Final design). The app half
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
| Asura Scans | asurascans.com | bespoke | kei `en/asurascans`, aidoku `en.asurascans` | #3; in every app | IMG-TILES (params known at page-list time) | todo |
| MangaFire | mangafire.to | bespoke | kei `all/mangafire`, aidoku `multi.mangafire` | #9; 65 & 53 👍 breakage issues | JS-SOLVER (VRF token) | todo |
| Mangakakalot | kakamanga.com (mangakakalot.gg redirects there), mangakakalove.com | **mangabox** | kei `en/mangakakalot`, aidoku `en.mangakakalot` | #40 | CF-CLEARANCE (search only) | wip: `0.1.0` built, unit-tested, live-audited (read path ✓; search challenged from home IP); not published |
| Manganato | manganato.gg (default), natomanga.com (now redirects to manganami.com), nelomanga.net | **mangabox** | kei `en/manganelo`, aidoku `en.manganato` | #43 | CF-CLEARANCE (search only) | wip: `0.1.0` built, unit-tested, live-audited (read path ✓; search challenged from home IP); not published |
| Mangabat | mangabats.com | **mangabox** | kei `en/mangabat`, aidoku `en.mangabat` | — | CF-CLEARANCE (search, intermittent) | wip: `0.1.0` built, unit-tested, live-audited (all ✓); not published |
| Kagane | kagane.to | bespoke | kei `all/kagane`, aidoku `multi.kagane` | 69 & 52 👍 | none known: integrity token + per-book page token, both plain API calls | todo |

## Tier 2

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Mangago | mangago.me | bespoke | kei `en/mangago`, aidoku `en.mangago` | #12 | IMG-TILES + encrypted image list | todo |
| King of Shojo | kingofshojo.com | **mangathemesia** | kei `en/kingofshojo`, aidoku `en.kingofshojo` | #21 | — | todo |
| Flame Comics | flamecomics.xyz | bespoke (small) | kei `en/flamecomics`, aidoku `en.flamecomics` | in every app | — | todo |
| MangaK (ex-MangaBuddy) | mangak.io | **mangak** (MadTheme) | kei `en/mangabuddy`, aidoku `en.mangak` | #44 | — | todo |
| Toonily.me | toontop.io | **mangak** (MadTheme) | kei `en/toonilyme`, aidoku `en.toonilyme` | — | — | todo |
| MangaTaro | mangataro.org | **mangataro** | kei `en/mangataro` | 27 👍 request | — | todo |
| Rolia Scan | roliascan.com | **mangataro** | kei `en/roliascan` | #19 — *added: nearly free once the MangaTaro engine exists* | — | todo |
| Toonkotsu | toonkotsu.com | bespoke | kei `en/toonkotsu`, aidoku `en.toonkotsu` | EverythingMoe "new" | IMG-BYTES (AES-CTR, key in the URL) | todo |
| OniSaga | onisaga.com | bespoke | kei `all/onisaga` | 16 👍 request | — | todo |
| Manga Ball | mangaball.com | bespoke | kei `all/mangaball`, aidoku `multi.mangaball` | 15 👍 request | — | todo |
| MangaDot | mangadot.net | bespoke | kei `all/mangadotnet`, aidoku `multi.mangadotnet` | EverythingMoe hub | JS-SOLVER? (kei uses a WebView — investigate) | todo |
| Webtoons | webtoons.com | bespoke (official) | kei `all/webtoons`, aidoku `multi.webtoon` | #26 | — (kei's bitmap code is optional page merging) | todo |
| MANGA Plus | mangaplus.shueisha.co.jp | bespoke (official, protobuf API) | kei `all/mangaplus`, aidoku `multi.mangaplus` | in every app | IMG-BYTES (XOR key per page, known at page-list time) | todo |
| Cubari | cubari.moe | bespoke (proxy for imgur/GitHub galleries) | kei `all/cubari`, aidoku `multi.cubari` | in every app | — | todo |
| Dynasty Scans | dynasty-scans.com | bespoke (JSON) | kei `en/dynasty`, aidoku `en.dynastyscans` | yuri hub | — | todo |
| BatCave | batcave.biz | bespoke (western comics) | kei `en/batcave`, aidoku `en.batcave` | #38 | JS-SOLVER? (kei uses a WebView — investigate) | todo |
| ReadComicOnline | readcomiconline.li | bespoke (western comics) | none current (dropped by Keiyoushi) | users keep asking; breaks often | obfuscated image URLs — investigate; do last | todo |

## Spanish

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Olympus Scanlation | olympusxyz.com | bespoke (API) | kei `es/olympusscanlation`, aidoku `es.olympusscanlation` | #4 | — | todo |
| ManhwaWeb | manhwaweb.com | bespoke (API) | kei `es/manhwaweb`, aidoku `es.manhwaweb` | #5 | — | todo |
| LectorXD | lectorxd.com | bespoke | kei `es/lectorxd` | #23 (+32 places in a month) | — | todo |
| ZonaTMO | zonatmo.org (+ zonatmo.to) | bespoke (TMO clone) | kei `es/zonatmoorgunoriginal`, `es/zonatmoto` | #37; fills the TuMangaOnline gap | domain churn, so plan for mirrors | todo |

## Notes from building

- **MangaBox (2026-11-14):** the three sites are one catalogue on one CDN (`*.2xstorage.com`) with
  identical markup and API, so the site files are pure config. Images and covers need a Referer
  from a site domain (declared in `BridgeInfo.images`). The testkit's cover sampler fetches without
  that Referer, so the audit reports covers as failed even though the app loads them: a testkit
  follow-up in `porksphere/comical`.

## Suggested build order

1. **Unblocked, high demand:** MangaBox engine (3 bridges) → Kagane → Olympus → ManhwaWeb.
2. **Engines that pay off:** MadTheme (2) → MangaTaro (2) → MangaThemesia (King of Shojo).
3. **Unblocked bespoke:** Flame, Manga Ball, OniSaga, Cubari, Dynasty, Webtoons, LectorXD, ZonaTMO.
4. **After the contract gaps close:** Asura (IMG-TILES) → MANGA Plus, Toonkotsu (IMG-BYTES) → Mangago
   → Comix (IMG-RESP + solver).
5. **After the JS-SOLVER investigations:** MangaFire, MangaDot, BatCave, then ReadComicOnline.

Asura is Tier 1 but waits on IMG-TILES, so the contract work is on the critical path. Start it in
parallel with step 1.

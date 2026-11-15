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
| Comix | comix.to (+ comix.ws) | bespoke | kei `en/comix` (2.2k LOC), aidoku `en.comix` | #2; top of EverythingMoe; most-👍 Keiyoushi issue of 2026 (163) | IMG-RESP (XOR + 5×5 grid), JS-SOLVER (request signer); actively anti-scraper | **blocked by design** (see blocked table) |
| Asura Scans | asurascans.com (JSON API at api.asurascans.com) | bespoke | kei `en/asurascans`, aidoku `en.asurascans` | #3; in every app | only premium pages are tiled, and premium needs a paid account (login not built) | shipped `0.1.1`: free chapters; tiled pages processed if served |
| MangaFire | mangafire.to | bespoke | kei `all/mangafire`, aidoku `multi.mangafire` | #9; 65 & 53 👍 breakage issues | JS-SOLVER (VRF token): ported. WAF captcha: surfaced, not solved | **shipped 0.1.0** (live audit passes) |
| Mangakakalot | kakamanga.com (mangakakalot.gg redirects there), mangakakalove.com | **mangabox** | kei `en/mangakakalot`, aidoku `en.mangakakalot` | #40 | CF-CLEARANCE (search only) | shipped `0.1.2` (read path ✓; search challenged by Cloudflare at times) |
| Manganato | manganato.gg (default), natomanga.com (now redirects to manganami.com), nelomanga.net | **mangabox** | kei `en/manganelo`, aidoku `en.manganato` | #43 | CF-CLEARANCE (search only) | shipped `0.1.2` (read path ✓; search challenged by Cloudflare at times) |
| Mangabat | mangabats.com | **mangabox** | kei `en/mangabat`, aidoku `en.mangabat` | — | CF-CLEARANCE (search, intermittent) | shipped `0.1.2` |
| Kagane | kagane.moe/.cx/.net (kagane.to is gone) | bespoke | kei `all/kagane`, aidoku `multi.kagane` | 69 & 52 👍 | **CF-CLEARANCE on every endpoint** (API included, even from a home IP); pages are JPEG XL, which Android cannot decode by default | blocked |

## Tier 2

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Mangago | mangago.me | bespoke | kei `en/mangago`, aidoku `en.mangago` | #12 | IMG-TILES + encrypted image list: done (kit `aes`, tiles via processed page images). **TLS-FINGERPRINT** | **shipped 0.1.0**; verified through host-server against a local mock, not yet against the live site |
| King of Shojo | kingofshojo.com | **mangathemesia** | kei `en/kingofshojo`, aidoku `en.kingofshojo` | #21 | — | shipped `0.1.0` (first site on the long-tail engine) |
| Flame Comics | flamecomics.xyz | bespoke (Next.js data routes) | kei `en/flamecomics`, aidoku `en.flamecomics` | in every app | — | shipped `0.1.0` |
| MangaK (ex-MangaBuddy) | mangak.io (API at api.mangak.io) | **madtheme** | kei `en/mangabuddy`, aidoku `en.mangak` | #44 | — | shipped `0.1.1` |
| Toonily.me | toontop.io (API at api.toontop.io) | **madtheme** | kei `en/toonilyme`, aidoku `en.toonilyme` | — | — | shipped `0.1.1` |
| MangaTaro | mangataro.org | **mangataro** | kei `en/mangataro` | 27 👍 request | many top licensed titles are taken down on the site (shown as such); English chapters only | shipped `0.1.0` |
| Rolia Scan | roliascan.com | **mangataro** | kei `en/roliascan` | #19 — *added: nearly free once the MangaTaro engine exists* | — | shipped `0.1.0` |
| Toonkotsu | toonkotsu.com | bespoke (JSON API) | kei `en/toonkotsu`, aidoku `en.toonkotsu` | EverythingMoe "new" | IMG-BYTES (AES-CTR per page): done with processed page images. **TLS-FINGERPRINT** and a Turnstile reading check (see blocked table) | **shipped 0.1.0**; verified through host-server against a local mock, not yet against the live site |
| OniSaga | onisaga.com | bespoke (RPC + Next.js) | kei `all/onisaga` | 16 👍 request | **CF-CLEARANCE site-wide** | blocked |
| Manga Ball | mangaball.com | bespoke (API, multilingual) | kei `all/mangaball`, aidoku `multi.mangaball` | 15 👍 request | — | shipped `0.1.0` (one bridge; Language setting) |
| MangaDot | mangadot.net | bespoke | kei `all/mangadotnet`, aidoku `multi.mangadotnet` | EverythingMoe hub | CF-CLEARANCE (Cloudflare even for curl; kei's WebView is only login) | blocked |
| Webtoons | webtoons.com | bespoke (official) | kei `all/webtoons`, aidoku `multi.webtoon` | #26 | motion comics not supported | shipped `0.1.0` (one bridge; Language setting) |
| MANGA Plus | mangaplus.shueisha.co.jp | bespoke (official, protobuf API) | kei `all/mangaplus`, aidoku `multi.mangaplus` | in every app | IMG-BYTES (XOR key per page, known at page-list time): done with processed page images; view token via `interceptImageRequest` | **shipped 0.1.0** |
| Cubari | cubari.moe | bespoke (proxy for imgur/GitHub galleries) | kei `all/cubari`, aidoku `multi.cubari` | in every app | no catalogue (Keiyoushi lists a WebView history); MangaDex-backed links can fail upstream | shipped `0.1.0` (search = paste a link) |
| Dynasty Scans | dynasty-scans.com | bespoke (JSON views) | kei `en/dynasty`, aidoku `en.dynastyscans` | yuri hub | list/search cards have no covers (the listing APIs carry none; Keiyoushi bundles a cover map) | shipped `0.1.0` |
| BatCave | batcave.biz | bespoke (western comics) | kei `en/batcave`, aidoku `en.batcave` | #38 | CF-CLEARANCE (DLE Guard anti-bot page; kei passes it in a WebView) | blocked |
| ReadComicOnline | readcomiconline.li | bespoke (western comics) | none current (dropped by Keiyoushi) | users keep asking; breaks often | obfuscated image URLs — investigate; do last | blocked (unreachable) |

## Spanish

| Source | Site | Engine | Upstream refs | Signals | Blockers | Status |
|---|---|---|---|---|---|---|
| Olympus Scanlation | olympusxyz.com (found via the olympus.pages.dev redirector) | bespoke (API) | kei `es/olympusscanlation`, aidoku `es.olympusscanlation` | #4 | — | shipped `0.1.1` |
| ManhwaWeb | manhwaweb.com (API at api.manhwaweb.com) | bespoke (API) | kei `es/manhwaweb`, aidoku `es.manhwaweb` | #5 | — | shipped `0.1.1` (adult series rated `adult`) |
| LectorXD | lectorxd.com | bespoke (HTML + Astro props) | kei `es/lectorxd` | #23 (+32 places in a month) | **CF-CLEARANCE on series and reader pages** (the catalogue is open) | blocked |
| ZonaTMO | zonatmo.org | bespoke (TMO clone) | kei `es/zonatmoorgunoriginal`, `es/zonatmoto` | #37; fills the TuMangaOnline gap | series id is the numeric library id (the site redirects any type/slug); latest maps uploads to series by cover id; zonatmo.to is a separate clone, not covered | **shipped 0.1.0** |

## Skipped, and why

Sources on the list that were not built. Details are in the blocked table below. One rule decided
these: **a bridge makes the requests a reader's browser would make, and does not defeat a site's
deliberate anti-bot measures** (no automatic captcha solving, no imitating human timing, no
automated browser driving). Where a site only lets a person through, the way in is a user-driven
web check in the app (**CF-CLEARANCE**), not a workaround in the bridge.

| Source | Why it was skipped (checked 2026-11-15) | What would change that |
|---|---|---|
| Comix | Built to keep automated clients out: refuses non-browser clients on its title and reader routes, blocks chapter-list paging that is too fast or too regular, answers `captcha_required`, and re-obfuscates its front end every build to break scrapers. Keiyoushi gets in only by driving a hidden WebView with randomized timing and a captcha solver. | A user-driven web reader in the app, or an official API. Not worth chasing otherwise. |
| MangaDot | Cloudflare challenges every page, even for curl. | CF-CLEARANCE. Reading itself is plain once through. |
| BatCave | "DLE Guard" anti-bot page (Keiyoushi passes it in a WebView); Node/Bun also get a Cloudflare challenge. | CF-CLEARANCE. |
| Kagane | Cloudflare challenges every endpoint, API included; pages are JPEG XL, which Android can't decode. | CF-CLEARANCE, plus a JPEG XL decoder on Android. |
| OniSaga | Cloudflare challenges every page and the RPC API. | CF-CLEARANCE. |
| LectorXD | Cloudflare challenges every series and reader page (the catalogue is open). | CF-CLEARANCE. |
| ReadComicOnline | Unreachable: connections to readcomiconline.li time out and the .to domain is gone; Keiyoushi dropped it too. | It answering again, from here or a phone. |

Shipped, but with part skipped for the same rule: **MangaFire**'s picture captcha is shown as an
error, not solved; **Toonkotsu**'s Turnstile reading check likewise. Two steps were refused by the
session's permission check as unauthorized access and only done once the user said to go ahead:
routing an audit through curl to get past Cloudflare's TLS fingerprinting (not done; Toonkotsu was
verified against a local mock instead) and calling MangaFire's API with its ported request token
(done after the go-ahead).

## Blocked or partly blocked: what would unblock them

Revisit at the end. Each entry says what is missing and where the work would go: **bridge** (this
repo), **comical** (contract/core/host), or **app** (comical-app).

| Source | State | What's missing | What would unblock it |
|---|---|---|---|
| Kagane | blocked | 1. Every endpoint, API included, answers a Cloudflare managed challenge, even from a home IP. 2. Pages are JPEG XL (`.jxl`), which Android's image stack (Glide) can't decode; iOS 17+ can. | 1. **CF-CLEARANCE** (below). 2. **app:** a JPEG XL decoder on Android, or test whether the `datasaver` page variant is served as WebP. Then the bridge needs integrity + per-book page tokens, both plain API calls. |
| OniSaga | blocked | Every page and the RPC API answer a Cloudflare managed challenge (checked 2026-11-15 from a home IP). | **CF-CLEARANCE** (below). After that: a cursor-paged catalog RPC, server-rendered title pages (ld+json, chapter pages paginated), Next.js reader data, and an age gate for adult titles (a form POST setting `__Host-onisaga.age_confirmed`, then `account/titleView` / `readerView` RPCs). |
| LectorXD | blocked | The catalogue is open, but every series page (and so every chapter list and reader) answers a Cloudflare managed challenge, consistently (checked 2026-11-15, home IP). | **CF-CLEARANCE** (below). After that, the work is simple: catalogue HTML with filters (`/catalogo?adult&orderBy&types&status&tags&search&page`), the series page's Astro `ChapterList` props, and the reader's `img.page-image`. |
| Mangakakalot, Manganato, Mangabat | shipped, search partly blocked | Search (`/search/story/…`) is challenged by Cloudflare bot scoring at random; browse, details and reading work. | **CF-CLEARANCE** (below). Nothing else. |
| Asura Scans | shipped, premium not readable | Premium and early-access chapters need a paid account; without one the API returns no pages, so they are hidden. | **bridge:** sign-in (`web-login` setting capturing the `access_token` cookie), then the premium endpoint with `Authorization` + `X-Page-Token`; its pages arrive tiled and are already handled by processed page images. Needs a subscriber account to build and verify. |
| MangaTaro | shipped, partly empty | Some titles only have non-English (pt-br) chapters, and many popular licensed titles are taken down ("Chapter not available"). | Takedowns: nothing to do. Languages: **bridge** could declare the other languages and tag chapters with `languageCode`. |
| Comix | blocked by design | The site actively fights automated clients: the title and reader routes refuse non-browser clients, chapter-list paging that is too fast or too evenly spaced is blocked, the API answers `403 captcha_required`, and the front end is re-obfuscated every build to break scrapers (Keiyoushi's own script notes the cat-and-mouse). Keiyoushi drives the real site in a background WebView with randomized timing and a captcha solver. (Checked 2026-11-15: home and title pages answer Node/Bun.) | Not pursued: it would mean defeating deliberate anti-bot measures. Revisit only if Comical gains a user-driven web reader (the user browses the site in a web view; nothing automated), or the site offers an API. |
| MangaFire | shipped, captcha partly blocks | The firewall sometimes answers `403 captcha_required` (a picture captcha that sets `waf_pass`); the bridge shows a plain error then. The request signer is ported (user go-ahead, 2026-11-15) and checked against a signature the live API accepted. | **CF-CLEARANCE**-style web check where the user solves the captcha and the `waf_pass` cookie is reused. Automatic solving: not pursued. |
| MangaDot, BatCave | blocked | MangaDot: Cloudflare challenges every page, even for curl (Keiyoushi's WebView is only for logging in to bookmarks; reading is plain). BatCave: "DLE Guard" anti-bot protection, which Keiyoushi passes in a WebView; Node/Bun get a Cloudflare challenge. | **CF-CLEARANCE** (below) for both. |
| Toonkotsu | shipped, live site unverified | 1. Cloudflare challenges the API for Node and Bun's TLS fingerprint, whatever the headers (curl passes, even with an OkHttp User-Agent; checked 2026-11-15, home IP). So the desktop/server hosts (Bun/Node `fetch`) and the CI audit can't reach it; phones (OkHttp, NSURLSession) should, as Keiyoushi and Aidoku do, but that hasn't been checked. 2. After some chapters the reader API answers 429 `manga-limit`/`verify` until a Turnstile check passes (Keiyoushi solves it in a WebView and POSTs the token to `/api/manga/unlock`); the bridge says so in plain words. | 1. **TLS-FINGERPRINT** (below): first check from the app on a phone. 2. **CF-CLEARANCE**-style web check: the same web-view flow, finishing with a token POST rather than a cookie. Everything but reachability is verified: the built bundle ran through `createHost()`'s router against a local mock serving the captured responses and a real encrypted page (lists, details, chapters, pages, and the image route returning the decrypted JPEG). |
| Mangago | shipped, live site unverified | 1. Same **TLS-FINGERPRINT** challenge as Toonkotsu on every page (checked 2026-11-15; curl passes). 2. Page hosts like `iweb_2.mangapicgallery.com` have underscores; they load over HTTPS from curl, but Keiyoushi switches them to `http`, which suggests Android's hostname check rejects them. 3. List cards carry no genres, so browse results are unrated (search results and details are rated); the catalogue is adult-heavy. 4. No scrambled (`cspiclink`) page was found in a sample of 8 popular series, so the tile path is tested on synthetic pages only. | 1. **TLS-FINGERPRINT** (below). 2. Check on Android; if images fail, rewrite underscore hosts to `http` (and allow cleartext for that host on iOS). 3. Accept, or rate the series on first details fetch. 4. Watch for a real scrambled chapter. |
| ReadComicOnline | blocked | Unreachable from here: readcomiconline.li resolves but every connection times out (HTTPS and HTTP), and readcomiconline.to no longer resolves (checked 2026-11-15). Keiyoushi dropped the source; its image URLs were obfuscated. | Check reachability from another network or a phone; if it answers, investigate the image-URL obfuscation. |

**Cross-cutting: CF-CLEARANCE.** Comical has no way to pass a Cloudflare challenge. Keiyoushi opens
the site in a WebView, lets the challenge run, and reuses the `cf_clearance` cookie, which is bound
to the browser's User-Agent and IP. What it would take:
- **comical:** a way for a bridge to say "this site needs clearance". This could be a setting kind
  like `web-login` (open the site, wait for `cf_clearance`, store the cookie), or a host-level
  handler that reacts to the challenge error the guard already raises.
- **host:** send that cookie, and the same User-Agent the browser used, on the bridge's requests.
- **app:** the web-view sheet, reusing what `web-login` already does.

**Cross-cutting: TLS-FINGERPRINT.** Some Cloudflare setups challenge by TLS/HTTP fingerprint, not
headers: Node's and Bun's `fetch` are challenged while curl and the phones' native stacks pass. A
host whose network is Node/Bun `fetch` (host-server, desktop, the CI audit) can't reach such a site
at all. Seen on Toonkotsu and Mangago. What it would take, smallest first:
- **check** which hosts are affected: the app on Android/iOS (native stacks) likely isn't.
- **comical/host:** if desktop matters, give the Node host a network path with a browser-like
  fingerprint (e.g. Electron's `net` module, which uses Chromium's stack) instead of Node `fetch`.
- **audit:** run such bridges' live audit from a device, or mark them flaky (done for Toonkotsu).
The MangaBox search challenges may be this too; untested.

## Open follow-ups (both repos)

Everything on the list is shipped, blocked or skipped. What's left, biggest first:

1. **An in-app web check (CF-CLEARANCE)** — unblocks Kagane, OniSaga, LectorXD, MangaDot, BatCave,
   and in the NSFW repo MyReadingManga, HDoujin and Schale Network; also covers MangaFire's captcha
   and Toonkotsu's reading check. Being investigated: see `docs/web-check.md`.
2. **Phone checks** (cheap, and the real test for these):
   - Toonkotsu, Mangago, IMHentai, Hentai2Read: Node/Bun are fingerprint-blocked, so they're only
     verified against captured responses. Open each in the app on Android and iOS.
   - Mangago: images on underscore hosts (`iweb_2…`) on Android.
   - Kemono and Pawchive: memory while the ~12–16 MB creator list loads.
3. **Desktop and CI for TLS-FINGERPRINT sites:** a browser-like network path for the Node host
   (e.g. Electron's `net`), only if desktop matters for those sources.
4. **Testkit:** the audit's cover sampler can't fetch covers routed through the host's relative
   image route, so bridges declaring image headers report false cover failures (comical).
5. **Optional:** HentaiRox, HentaiZap, HentaiEnvy, AsmHentai, HentaiEra on the galleryadults engine
   (all answer Node/Bun; most need their own card selectors). ReadComicOnline: recheck now and then.
6. **Decisions for the user:**
   - Pawchive's User-Agent asks "preferably" for a contact; none is included yet.
   - MangaTaro signs its chapter-list requests with an MD5 token, the same kind of front-end request
     signing the session's permission check flagged on MangaFire (which went ahead on the user's
     say-so). Keep as is, or revisit.
   - The automation pipeline (`docs/maintenance.md`) stays on hold until asked for.

## Notes from building

- **MangaBox (2026-11-14):** the three sites are one catalogue on one CDN (`*.2xstorage.com`) with
  identical markup and API, so the site files are pure config. Images and covers need a Referer
  from a site domain (declared in `BridgeInfo.images`). The loader rewrites a cover on a declared
  image host to the host's relative image route (`/bridges/{id}/image?url=…`), which the testkit's
  cover sampler can't fetch (`fetch()` gets no origin), so the audit reports such covers as failed
  even though the app loads them: a testkit follow-up in `porksphere/comical`. Declare `images`
  only for hosts that need the headers.

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

- **ZonaTMO (2026-11-15):** server-rendered, no challenge. The library's ajax view answers
  `{html}` cards; latest uploads link chapters, not series, so the series id is read from the cover
  (`/tc/{id}-…`). Any `/library/{type}/{id}/{slug}` redirects to the canonical page, so the id is the
  number alone. Every chapter (the folded ones too) is on the series page. Nothing needs a Referer,
  so `images` isn't declared and covers load directly.

- **MANGA Plus (2026-11-15):** the API answers protobuf only (no JSON variant), so the bridge
  reads it with a small schema-less wire reader (`src/core/protobuf.ts`) over `responseType:
  "base64"`. The first bridge whose public pages need processing: each page is XOR'd with its own
  key (in `Page.process.context`, turned into an `xor` transform by `decodePageImage`) and needs the
  chapter's view token as a header, which rides the URL fragment to `interceptImageRequest`. Only
  the page host (`jumpg-assets3`) is intercepted so covers load directly; a page on any other host
  makes `getChapterPages` throw, so a CDN move shows up in the nightly audit. Verified end to end
  through the loader, `resolveImageRequest` and `processPageImage` on the built bundle.

- **Toonkotsu (2026-11-15):** a clean JSON API with lots of uploads per chapter (groups, and one
  group's copies from several sources); the list keeps one per chapter and group like the site's,
  complete before partial. Pages are AES-256-CTR with a per-page key and an 8-byte nonce (the counter
  is the nonce plus zeros), carried in `Page.process.context`. Series ids are the `code` in the
  site's links, not the internal `hid` (the API takes both). The API is unreachable from Node/Bun
  (TLS-FINGERPRINT), so it was built from responses fetched by hand and verified end to end through
  host-server against a local mock of them; the live audit is flaky.

- **Mangago (2026-11-15):** the reader's page list is AES-128-CBC encrypted; the key and IV, and
  the tile orders for scrambled images, sit in an obfuscated `chapter.js` (sojson v4, character
  codes split by letters). The bridge reads all of it as data and runs none of it: regexes for the
  key, IV, tile-order table and grid size, plus a port of the site's string shuffle for the two
  orders stored shuffled (each comes out a permutation of 0–80 only once unshuffled, which the tests
  check). The kit gained `aesCbcDecrypt` (NIST-tested). The list's own shuffle step in the script is
  a decoy: the result is thrown away and the plain decrypted list used. Built from pages fetched by
  hand and verified through host-server against a local mock (TLS-FINGERPRINT again).

- **MangaFire (2026-11-15):** a clean JSON API behind a request token (`vrf`) the front end
  computes: three byte-substitution stages with fixed tables over the path and sorted query, `[]`
  keys numbered. The API refuses a missing or wrong token, and a test pins a signature the live API
  accepted. Reachable from Node/Bun, so the live audit is real. Pages need a mangafire.to Referer
  (only the page host is declared, so covers load directly); a page on another host is refused
  loudly so a CDN move shows in the audit.

## Suggested build order

1. **Unblocked, high demand:** MangaBox engine (3 bridges) → Kagane → Olympus → ManhwaWeb.
2. **Engines that pay off:** MadTheme (2) → MangaTaro (2) → MangaThemesia (King of Shojo).
3. **Unblocked bespoke:** Flame, Manga Ball, OniSaga, Cubari, Dynasty, Webtoons, LectorXD, ZonaTMO.
4. **After the contract gaps close:** Asura (IMG-TILES) → MANGA Plus, Toonkotsu (IMG-BYTES) → Mangago
   → Comix (IMG-RESP + solver).
5. **After the JS-SOLVER investigations:** MangaFire, MangaDot, BatCave, then ReadComicOnline.

Asura is Tier 1 but waits on IMG-TILES, so the contract work is on the critical path. Start it in
parallel with step 1.

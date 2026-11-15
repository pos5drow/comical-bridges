# In-app web check (CF-CLEARANCE): what it would take

Investigated 2026-11-15. Eight sources are blocked on it (see `roadmap.md`, "Skipped, and why"),
and it would also cover MangaFire's picture captcha and Toonkotsu's reading check.

## Status (2026-11-15)

Built and pushed, following the derived design below:

- **comical** 0356090: the challenge marker; detection in core's network layer
  (`cf-mitigated: challenge`, the host held while a check waits); core's cookie jar as the one
  store (RFC 6265 domains, paths and expiry, kept in the bridge's secure storage, imports added to
  a bridge's own `Cookie`); 403 `{ challenge }`; `POST`/`DELETE /bridges/:id/cookies`; routed
  images carry the session. e7d3da4: hosts can pass their own `fetch`.
- **comical-app** 9bacb849: `data/web-check.ts`; the transport runs a check and retries once; the
  phone's `WebCheckHost` (hidden web view first, the same view full screen when the check wants a
  person, done when a clearance cookie changes); Verify in the retry block; the desktop shell's
  hidden window; Chromium's network for the desktop host behind `COMICAL_CHROMIUM_NETWORK=1`.
- **Page-storage values** (point 14), comical 29f584c and comical-app 0367f477: a bridge names
  the localStorage keys on its own challenge, `challengeMessage({ url, userAgent, storage })`,
  thrown from its request override when the site's API refuses for want of the token. No
  `BridgeInfo` field is needed. The check is done once every key is set and one is new. The
  values go to the import (`values`), and the bridge reads them with
  `host.storage.secure.get(webCheckStorageKey(key))`. They're forgotten with the session's
  cookies.
- **Bridge repos:** the guard adapter turns the kit's `challenge` verdict into the same marker,
  with the request's User-Agent; every bridge using it got a patch bump.

Still to do: an on-device run against a real challenged site (iOS first, then Android, where the
WebView and OkHttp have different TLS fingerprints); turning the desktop's Chromium network on
by default once a build shows Set-Cookie and User-Agent come through it; and building the blocked bridges, which needs pages or
a HAR from a browser, or probing through a session the user has cleared.

## The idea

When a site answers with a bot check, the app opens the site in a web view and **the user passes
the check themselves**, as they would in a browser. The app then hands what the check left behind
to the host, which uses it for that bridge's requests to that site until it runs out:

- **Cookies** (Cloudflare's `cf_clearance`, MangaFire's `waf_pass`, DDoS-Guard's): Cloudflare ties
  `cf_clearance` to the User-Agent and IP that earned it, so **the web view runs with the same
  User-Agent the bridge's requests send**, on the same device, and the cookies go into the jar
  those requests already use.
- **Named values from the page's localStorage** (HDoujin's and Schale Network's `clearance` token,
  which the bridge sends as a `crt` query parameter): handed to the bridge, not to the network.

Nothing here is automated. The user solves the check. The rule written in the roadmap still
holds: no captcha solving, no human-timing mimicry, no automated browsing.

## What exists already

- **`web-login` settings** (contract 2.1): the host opens a site's page in a browser it can read
  cookies from, waits until named cookies are set, and stores them as a `Cookie` string the bridge
  sends. The mobile app has `WebLoginSheet` (react-native-webview plus a native `web-cookies`
  module that can read HttpOnly cookies); desktop has an Electron window on a fresh session that
  already strips the app name out of its User-Agent, because bot checks turn away odd ones.
- **An error-marker pattern with a recovery screen**: `loginRequiredMessage(key)` →
  `parseLoginRequired`; host-server answers 401 naming the setting, and the app sends the user
  there. A challenge marker can follow it exactly.
- **Core's gated network** wraps every bridge request and already keeps a per-bridge cookie jar,
  attaching cookies unless the bridge set its own. That's where clearance belongs.
- **The kit's guards** already detect Cloudflare and DDoS-Guard challenges and return a
  `challenge` verdict; `src/core/guarded.ts` maps it to a rate-limited error today (24 bridges use
  it across both repos).
- **`getDefaultUserAgent()`**, an optional host capability, reports the platform's User-Agent. On
  iOS it's an app string, not the web view's, so it can't stand in for the captured one.

## How other apps do it (read from their source, 2026-11-15)

| | Mihon (Android) | Kotatsu (Android) | Aidoku (iOS) | Paperback (iOS) |
|---|---|---|---|---|
| Detects | `cf-mitigated: challenge` + `Server: cloudflare` (Cloudflare's documented signal) | status, headers and page markers, in an interceptor | 403/503 + `Server: cloudflare` + challenge elements | the source throws `CloudflareError(request)` |
| Web view's User-Agent | **the request's** | **the source's request User-Agent** | **the request's** (`customUserAgent`) | the request's |
| How cookies reach requests | **one store**: OkHttp reads the WebView's `CookieManager` | **one store**, shared the same way | copies the web view's cookies into `URLSession`'s store | hands them to the source (`saveCloudflareBypassCookies`) |
| Done when | `cf_clearance` changes | `cf_clearance` changes | `cf_clearance` changes | the user closes it |
| Hidden attempt first | yes, a 30 s invisible WebView; stops as soon as the check turns interactive | yes, a headless WebView with a timeout | yes, a 0×0 web view; if a "verify" control appears, the same view moves into a sheet | no |
| When the user is needed | error, then "Open in WebView" | "captcha required" flag on the source and a notification, then a browser screen | the sheet opens by itself | a button in the source |
| Concurrency | one check per host; other requests wait | one at a time | one per host; others wait | — |
| Images | same HTTP client, so they hit the same path | image-load failures feed the same handler | same | — |

What they agree on, and what my first draft got wrong:

- **The web view takes the request's User-Agent.** None of them capture the web view's User-Agent
  and impose it on requests. They do the reverse: the check runs with the User-Agent the requests
  already send. That removes the User-Agent override from the design.
- **Cookies go into the one store requests already use.** None keep a separate "clearance store".
- **Detection sits in the HTTP layer**, not in each source. Paperback is the exception, and the
  only one that needs per-source code.
- **"Done" means `cf_clearance` changed** from its value before the check.
- Aidoku and Mihon also fetch the platform web view's real User-Agent and use it as the default.
  A desktop-Chrome User-Agent sent over iOS's network stack is the kind of mismatch bot checks
  look for.

## Derived design for Comical

Each part follows the apps above and fits Comical's split. Comical and the app stay site-agnostic.

### comical

1. **Detect in core's gated network**, like Mihon's interceptor: a response with
   `cf-mitigated: challenge` (Cloudflare's documented header), or one of a short list of other
   vendors' challenge markers, throws `challengeMessage({ url, userAgent })`. That's a new marker
   beside rate-limited and login-required, carrying the request's URL (the site root for non-GET,
   as Mihon does) and the User-Agent it sent. Every bridge gets this without changes. The kit's
   guards stay as a fallback for pages without the header, and the adapter maps their `challenge`
   verdict to the same marker.
2. **Make core's per-bridge cookie jar the one store**: persist it through host storage, honour
   expiry, and let the host import cookies into it. That's the equivalent of Mihon's and Kotatsu's
   shared jar and Aidoku's copy into `URLSession`, and it helps any site with session cookies.
3. **One check per site at a time:** while one is pending, other requests to that host fail fast
   with the same challenge, so the app shows one sheet, not ten.
4. **Images use the same jar**: the image route and the download page fetcher attach the bridge's
   cookies for the image's host, and a challenge there raises the same marker. Kotatsu feeds image
   failures into the same handler.
5. **`getDefaultUserAgent()` returns the platform web view's real User-Agent**, read once from a
   web view, as Aidoku and Mihon do. On iOS today it's an app string. Bridges should send it by
   default rather than a hard-coded desktop Chrome string.

### host-server (and host-rn, which reuses the router)

6. Map the marker to **403 `{ error, challenge: { url, userAgent } }`** (the 401 login-required
   mapping is the model).
7. `POST /bridges/:id/cookies` `{ url, cookies }` imports into the jar;
   `DELETE /bridges/:id/cookies?site=` forgets a site's.

### comical-app

8. **`WebCheckSheet`**, a sibling of `WebLoginSheet`:
   - it opens `url` with **`userAgent` as the web view's User-Agent**;
   - it doesn't clear cookies first; it notes `cf_clearance` (and the other vendors' cookie names)
     before loading;
   - it finishes when one changes (or on Done), reads the site's cookies with the existing
     `web-cookies` module, imports them, closes, and retries the query that failed.
9. **Surfaces:** a "Verify" action on any screen whose request failed with `challenge`. Background
   work can't prompt, so the source is flagged "needs verification", Kotatsu-style, and the flag
   clears when a check succeeds.
10. **Hidden attempt first?** All four apps try an invisible web view before involving the user,
    and Aidoku moves that same view into a sheet the moment the check turns interactive. It's a
    real browser engine letting the site's own non-interactive check run, not captcha solving, but
    it is automatic. **v1: the visible sheet only.** The hidden attempt, Aidoku-style, can be added
    later if the user wants it.
11. **Desktop:** the Electron sign-in window gains the same mode, and imports into host-server's
    jar. Node `fetch`'s TLS fingerprint can still fail a reused `cf_clearance` (Cloudflare flags it;
    the TLS-FINGERPRINT problem), so the desktop host's network should move to Electron's
    `net.fetch`, which uses the same Chromium stack as the window.
12. **Web:** can't read another site's cookies; say so and point to the phone or desktop app.

### Bridge repos

13. The adapter maps the kit's `challenge` verdict to the new marker. Bridges switch from their
    hard-coded Chrome User-Agent to the host's default where they can.
14. **Values from the page instead of cookies** (HDoujin's and Schale's localStorage `clearance`
    token): built. The keys ride on the bridge's own challenge (`storage`) rather than a
    `BridgeInfo` declaration, since only the bridge knows when its token is missing or stale. The
    runner reads them from the check's page and they reach the bridge's secure storage under
    `webCheckStorageKey(key)`.
15. **Then build the blocked bridges.** They can't be studied from this machine without a
    cleared session: either pages or a HAR exported from a browser, or probing through a session
    the user cleared once desktop has the check (may need the user's go-ahead).

### What changed from the first draft

- No captured User-Agent and no User-Agent override: the web view uses the request's User-Agent.
- No separate clearance store: core's cookie jar, persisted, is the one store.
- Detection in core, not per bridge: every bridge is covered at once.
- Named cookies don't need declaring: success is `cf_clearance` (or the other vendors' cookies)
  changing, plus Done. Page-storage keys travel on the challenge itself, not in a declaration.

## Which sources it would unblock

| Source | What the check leaves | Confidence |
|---|---|---|
| Kagane | `cf_clearance` | Good on iOS, likely on Android; also needs a JPEG XL decoder on Android for its pages |
| OniSaga | `cf_clearance`, then an age-gate cookie (a form the user submits in the same sheet) | Good |
| LectorXD | `cf_clearance` (series and reader pages) | Good |
| MangaDot | `cf_clearance` | Good |
| MyReadingManga | `cf_clearance` ("Verification Required") | Good |
| BatCave | DLE Guard page plus Cloudflare | Unverified: depends on what DLE Guard sets |
| HDoujin | localStorage `clearance` token | Good: storage values are collected; the bridge still needs building |
| Schale Network | localStorage `clearance` token (after the user solves its Turnstile) | Good: storage values are collected; the bridge still needs building |
| MangaFire (captcha) | `waf_pass` cookie | Good |
| Toonkotsu (reading check) | session cookie after the site's own unlock | Unverified |

## Size

Rough, for one person:

| Piece | Estimate |
|---|---|
| Contract and core (marker, detection, persistent jar, images, real default UA, tests) | 1–2 days |
| Router endpoints | 0.5 day |
| App sheet, error surfaces and the "needs verification" state | 2–3 days |
| Desktop `net.fetch` network | ~1 day |
| Adapter change in the bridge repos | under an hour |
| Each blocked bridge, once it can be studied | 0.5–1 day |

Order: contract/core → router → app (iOS first: WKWebView and URLSession share one network stack) → one bridge end to end
(LectorXD: its catalogue is open, so only part of it needs clearance) → the rest → desktop.

## Open questions

- Does Android's OkHttp pass with a WebView-earned `cf_clearance` on these particular sites? Test
  one on a device before building the rest.
- How long each site's clearance lasts (minutes to days), and so how often users will see the sheet.
- Whether clearance should sync between devices. Probably not: it's bound to the device's IP and
  User-Agent.

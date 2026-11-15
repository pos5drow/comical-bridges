# In-app web check (CF-CLEARANCE): what it would take

Investigated 2026-11-15. Eight sources are blocked on it (see `roadmap.md`, "Skipped, and why"),
and it would also cover MangaFire's picture captcha and Toonkotsu's reading check.

## The idea

When a site answers with a bot check, the app opens the site in a web view and **the user passes
the check themselves**, as they would in a browser. The app then hands what the check left behind
to the host, and the host applies it to that bridge's requests to that site until it runs out:

- **Cookies and the web view's User-Agent** (Cloudflare's `cf_clearance`, MangaFire's `waf_pass`,
  DDoS-Guard's): Cloudflare ties `cf_clearance` to the User-Agent and IP that earned it, so later
  requests must send the **same User-Agent** from the same device.
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

## What it would take

### comical (contract and core, all site-agnostic)

1. **A challenge marker:** `challengeMessage(url, reason)` / `parseChallenge(message)` →
   `[challenge:<url>]`, beside the rate-limited and login-required markers. `url` is the page to
   open (the one that was challenged, or the site's root).
2. **What to collect** (optional, on `BridgeInfo`): `webCheck: { cookies?: string[]; storage?:
   string[] }`. `cookies` names the cookies that mean "passed" (e.g. `cf_clearance`), so the sheet
   can close by itself. `storage` names localStorage keys to hand to the bridge. With neither, the
   user taps Done.
3. **A clearance store in core**, per bridge and per site (host plus subdomains), kept in the
   bridge's host storage under a reserved key with the time it was captured:
   - the gated network adds the stored cookies to matching requests (merged with the bridge's own
     `Cookie`) and **replaces the User-Agent** with the captured one;
   - a fresh challenge from that site drops the entry, so the next error asks again;
   - collected localStorage values are readable by the bridge (a small `webCheck` capability, or
     the reserved storage key).
4. **Images too:** the image route (`resolveImageRequest`) and the download page fetcher must add
   the same cookies and User-Agent when the image host is behind the same check.

### host-server (and so host-rn, which reuses the router)

5. Map a challenge error to **403 `{ error, challenge: { url } }`**.
6. `POST /bridges/:id/clearance` `{ url, cookies, userAgent, values }` stores an entry;
   `DELETE /bridges/:id/clearance?site=` clears it.

### comical-app

7. **A `WebCheckSheet`**, a sibling of `WebLoginSheet`. Differences:
   - it doesn't clear cookies first;
   - it reads `navigator.userAgent` and the named localStorage keys through injected JavaScript;
   - it finishes when the named cookies appear, or on Done.
8. **Where it's offered:** any screen whose request failed with `challenge` (list, search, series,
   reader) shows "Verify in browser"; after it succeeds the query retries. Background work
   (downloads, update checks) can't prompt, so it marks the source "needs verification" and the
   next foreground visit offers it.
9. **Per platform:**
   - **iOS:** WKWebView and the native network stack share CFNetwork, so the clearance should hold.
   - **Android:** the WebView (Chromium) and OkHttp have different TLS fingerprints. Keiyoushi lives
     with this and it works for most sites, but strict Bot Management configurations can reject the
     reused cookie.
   - **Desktop:** the window and its cookies exist already, but host-server's network is Node
     `fetch`, whose fingerprint Cloudflare flags (that is the TLS-FINGERPRINT problem). Routing the
     desktop host's network through Electron's `net.fetch` (Chromium's stack) would fix both at once.
   - **Web:** a page can't read another site's cookies, so the check can't work. Say so and point to
     the phone or desktop app.

### Bridge repos

10. `src/core/guarded.ts`: map a `challenge` verdict to `challengeMessage(res.url)` (keep
    rate-limited for `blocked` and 429s). That's one place for all 24 guarded bridges.
11. Declare `webCheck` on the bridges that need named cookies or storage values; HDoujin and
    Schale read their `crt` token from it.
12. **Build the blocked bridges.** This is most of the work. Every one of them is challenged
    even for curl from here, so the site can't be studied from this machine without a cleared
    session. Options: the user exports pages or a HAR from a browser, or, once desktop has the
    web check and `net.fetch`, probing runs through a session the user cleared. That probing
    may need the user's go-ahead again; the permission check has flagged similar work. Keiyoushi's
    code covers what each site expects.

## Which sources it would unblock

| Source | What the check leaves | Confidence |
|---|---|---|
| Kagane | `cf_clearance` | Good on iOS, likely on Android; also needs a JPEG XL decoder on Android for its pages |
| OniSaga | `cf_clearance`, then an age-gate cookie (a form the user submits in the same sheet) | Good |
| LectorXD | `cf_clearance` (series and reader pages) | Good |
| MangaDot | `cf_clearance` | Good |
| MyReadingManga | `cf_clearance` ("Verification Required") | Good |
| BatCave | DLE Guard page plus Cloudflare | Unverified: depends on what DLE Guard sets |
| HDoujin | localStorage `clearance` token | Good once storage values are collected |
| Schale Network | localStorage `clearance` token (after the user solves its Turnstile) | Good once storage values are collected |
| MangaFire (captcha) | `waf_pass` cookie | Good |
| Toonkotsu (reading check) | session cookie after the site's own unlock | Unverified |

## Size

Rough, for one person:

| Piece | Estimate |
|---|---|
| Contract and core (marker, store, network and image hooks, tests) | 1–2 days |
| Router endpoints | 0.5 day |
| App sheet, error surfaces and the "needs verification" state | 2–3 days |
| Desktop `net.fetch` network | ~1 day |
| Adapter change in the bridge repos | under an hour |
| Each blocked bridge, once it can be studied | 0.5–1 day |

Order: contract/core → router → app (iOS first, the most likely to hold) → one bridge end to end
(LectorXD: its catalogue is open, so only part of it needs clearance) → the rest → desktop.

## Open questions

- Does Android's OkHttp pass with a WebView-earned `cf_clearance` on these particular sites? Test
  one on a device before building the rest.
- How long each site's clearance lasts (minutes to days), and so how often users will see the sheet.
- Whether clearance should sync between devices. Probably not: it's bound to the device's IP and
  User-Agent.

# Bridge audit — detailed results

Per-check results from the nightly live audit ([`audit.ts`](audit.ts)) — every conformance probe run
against the real backend. ✓ pass · ⚠ warn · ✗ fail. Warnings never fail the run; a tolerated
flaky/blocked bridge (see [`audit.config.ts`](audit.config.ts)) shows ⚠ even for a hard failure.
See [`README.md`](README.md#status) for the summary.

## `atsumaru` — ⚠ (13✓ 1⚠ 0✗)

**6/8 capabilities** · cover 54 KB (360×540) · sampled 8 · failed 0 · bytes min 32 KB / avg 54 KB / median 53 KB / max 81 KB · dims avg 360×540 (max 360×540) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `favorites.read` | favorites | getFavorites could not be read (authentication required?): getFavorites threw: Error: favorites require a username + password (set them in this bridge's settings) |
| ✓ | `info.capabilities` | core | declares 8 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "trending" returned 40 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 12 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "genre" changed results (12→8) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `sort.effect` | sort | sort "views" reorders results (asc ≠ desc) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 267 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 58 page(s) |

## `mangadex` — ⚠ (8✓ 1⚠ 0✗)

**3/3 capabilities** · cover 51 KB (256×376) · sampled 8 · failed 0 · bytes min 23 KB / avg 51 KB / median 46 KB / max 81 KB · dims avg 256×376 (max 256×402) · aspect avg 0.68

> Cloudflare challenges datacenter (runner) IPs

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.chapters.empty` | core | series has no chapters |
| ✓ | `info.capabilities` | core | declares 3 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 24 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "contentRating" changed results (24→24) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

## `nhentai` — ⚠ (11✓ 4⚠ 0✗)

**7/10 capabilities** · cover 25 KB (500×628) · sampled 8 · failed 0 · bytes min 15 KB / avg 25 KB / median 26 KB / max 35 KB · dims avg 500×628 (max 500×734) · aspect avg 0.86

> Cloudflare / IP-gated from datacenters

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `sort.effect` | sort | asc/desc on "date" produced identical order |
| ⚠ | `favorites.read` | favorites | getFavorites could not be read (authentication required?): getFavorites threw: Error: favorites require an API key (create one at nhentai.net › Account › API Keys) |
| ⚠ | `read.details.description` | core | series details have no description |
| ⚠ | `read.details.genres` | core | series details have no genres |
| ✓ | `info.capabilities` | core | declares 10 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular-now" returned 5 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 25 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `filters.effect` | filters | filter "language" changed results (25→25) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |
| ✓ | `direct.pages` | direct | getSeriesPages returned 53 page(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

## `e-hentai` — ⚠ (8✓ 4⚠ 0✗)

**6/6 capabilities** · cover 21 KB (250×289) · sampled 8 · failed 0 · bytes min 12 KB / avg 21 KB / median 19 KB / max 36 KB · dims avg 250×289 (max 250×375) · aspect avg 0.97

> sad-panda / IP + cookie gated from datacenters

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `search.items` | search | search for "the" returned no items (try --query) |
| ⚠ | `filters.effect` | filters | applying filter "category=doujinshi" did not change results |
| ⚠ | `favorites.read` | favorites | getFavorites could not be read (authentication required?): getFavorites threw: Error: favorites require your e-hentai session cookies — on a logged-in browser open DevTools → Application → Cookies and paste ipb_member_id and ipb_pass_hash into this bridge's settings |
| ⚠ | `read.details.genres` | core | series details have no genres |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "home" returned 25 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `direct.pages` | direct | getSeriesPages returned 42 page(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

_Updated 2026-07-18 by the nightly live audit ([`audit.ts`](audit.ts))._

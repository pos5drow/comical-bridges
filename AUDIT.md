# Bridge audit — detailed results

Per-check results from the nightly live audit ([`audit.ts`](audit.ts)) — every conformance probe run
against the real backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an
inconclusive sort/filter probe — never a defect). Warnings never fail the run; a tolerated
flaky/blocked bridge (see [`audit.config.ts`](audit.config.ts)) shows ⚠ even for a hard failure.
See [`README.md`](README.md#status) for the summary.

## `atsumaru` — ✓ (13✓ 0⚠ 0✗ 1⊘)

**6/7 capabilities** · cover 54 KB (360×540) · sampled 8 · failed 0 · bytes min 32 KB / avg 54 KB / median 53 KB / max 81 KB · dims avg 360×540 (max 360×540) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `favorites.read` | favorites | getFavorites needs credentials (none configured) — skipped: getFavorites threw: Error: favorites require a username + password (set them in this bridge's settings) |
| ✓ | `info.capabilities` | core | declares 7 capability(ies) |
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
| ✓ | `read.chapters` | core | got 268 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 58 page(s) |

## `weebcentral` — ✓ (11✓ 0⚠ 0✗ 1⊘)

**4/4 capabilities** · cover 17 KB (200×300) · sampled 8 · failed 0 · bytes min 11 KB / avg 17 KB / median 16 KB / max 25 KB · dims avg 200×300 (max 200×300) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `sort.effect` | sort | asc/desc on "Best Match" produced identical order |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 32 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 32 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `filters.effect` | filters | filter "status" changed results (32→26) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 355 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 18 page(s) |

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

## `nhentai` — ⚠ (11✓ 2⚠ 0✗ 2⊘)

**7/10 capabilities** · cover 28 KB (500×711) · sampled 8 · failed 0 · bytes min 20 KB / avg 28 KB / median 28 KB / max 40 KB · dims avg 500×711 (max 500×742) · aspect avg 0.70

> Cloudflare / IP-gated from datacenters

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.description` | core | series details have no description |
| ⚠ | `read.details.genres` | core | series details have no genre tag group (kind: "genre") |
| ⊘ | `sort.effect` | sort | asc/desc on "date" produced identical order |
| ⊘ | `favorites.read` | favorites | getFavorites needs credentials (none configured) — skipped: getFavorites threw: Error: favorites require an API key (create one at nhentai.net › Account › API Keys) |
| ✓ | `info.capabilities` | core | declares 10 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular-now" returned 5 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 25 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `filters.effect` | filters | filter "language" changed results (25→25) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |
| ✓ | `direct.pages` | direct | getSeriesPages returned 66 page(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

## `e-hentai` — ⚠ (10✓ 3⚠ 0✗ 1⊘)

**6/6 capabilities** · cover 20 KB (238×343) · sampled 8 · failed 0 · bytes min 13 KB / avg 20 KB / median 20 KB / max 29 KB · dims avg 238×343 (max 250×375) · aspect avg 0.75

> sad-panda / IP + cookie gated from datacenters

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.author` | core | series details have no author |
| ⚠ | `read.details.description` | core | series details have no description |
| ⚠ | `read.details.genres` | core | series details have no genre tag group (kind: "genre") |
| ⊘ | `favorites.read` | favorites | getFavorites needs credentials (none configured) — skipped: getFavorites threw: Error: favorites require your e-hentai session cookies — on a logged-in browser open DevTools → Application → Cookies and paste ipb_member_id and ipb_pass_hash into this bridge's settings |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 76 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 25 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "category" changed results (25→25) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `direct.pages` | direct | getSeriesPages returned 1907 page(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

## `hitomi` — ⚠ (9✓ 2⚠ 0✗ 2⊘)

**5/6 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

> images need the host /img-proxy (Referer-gated), unavailable in the audit

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.description` | core | series details have no description |
| ⚠ | `read.details.genres` | core | series details have no genre tag group (kind: "genre") |
| ⊘ | `filters.effect` | filters | applying filter "language=all" did not change the sampled page |
| ⊘ | `sort.effect` | sort | asc/desc on "latest" produced identical order |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "popular-today" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `search.items` | search | search returned 24 item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `direct.pages` | direct | getSeriesPages returned 147 page(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

_Updated 2026-07-22 by the nightly live audit ([`audit.ts`](audit.ts))._

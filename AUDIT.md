# Bridge audit — detailed results

Per-check results from the live bridge audit — every conformance probe run against the real
backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an inconclusive
sort/filter probe — never a defect). Warnings never fail the run; a tolerated flaky/blocked bridge
shows ⚠ even for a hard failure.

## `atsumaru` — ✓ (15✓ 0⚠ 0✗ 1⊘)

**6/7 capabilities** · cover 48 KB (360×540) · sampled 8 · failed 0 · bytes min 23 KB / avg 48 KB / median 46 KB / max 77 KB · dims avg 360×540 (max 360×540) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `favorites.read` | favorites | getFavorites needs credentials (none configured) — skipped: getFavorites threw: Error: favorites require a username + password (set them in this bridge's settings) |
| ✓ | `info.capabilities` | core | declares 7 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "trending" returned 40 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 40 further item(s) |
| ✓ | `search.items` | search | search returned 12 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "genre" changed results (12→8) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `sort.effect` | sort | sort "views" reorders results (asc ≠ desc) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 274 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 58 page(s) |

## `weebcentral` — ✗ (4✓ 2⚠ 1✗ 2⊘)

**4/4 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✗ | `lists.items` | lists | list "popular" returned no items |
| ⚠ | `search.items` | search | search for "blue" returned no items (try --query) |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ⊘ | `filters.effect` | filters | applying filter "status=Ongoing" did not change the sampled page |
| ⊘ | `sort.effect` | sort | not enough results to observe sort order |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |

## `mangadex` — ⚠ (10✓ 1⚠ 0✗)

**3/3 capabilities** · cover 50 KB (256×376) · sampled 8 · failed 0 · bytes min 23 KB / avg 50 KB / median 46 KB / max 81 KB · dims avg 256×376 (max 256×402) · aspect avg 0.68

> Cloudflare challenges datacenter (runner) IPs

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.chapters.empty` | core | series has no chapters |
| ✓ | `info.capabilities` | core | declares 3 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 24 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 24 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "contentRating" changed results (24→24) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

_Updated 2026-09-10 by the nightly live audit ([`audit.ts`](audit.ts))._

# Bridge audit — detailed results

Per-check results from the live bridge audit — every conformance probe run against the real
backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an inconclusive
sort/filter probe — never a defect). Warnings never fail the run; a tolerated flaky/blocked bridge
shows ⚠ even for a hard failure.

## `atsumaru` — ✓ (15✓ 0⚠ 0✗ 1⊘)

**6/7 capabilities** · cover 47 KB · sampled 8 · failed 0 · bytes min 23 KB / avg 47 KB / median 45 KB / max 77 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `favorites.read` | favorites | getFavorites needs credentials (none configured) — skipped: getFavorites threw: Error: favorites require a username + password (set them in this bridge's settings) |
| ✓ | `info.capabilities` | core | declares 7 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "trending" returned 40 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 40 further item(s) |
| ✓ | `search.items` | search | search returned 13 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "genre" changed results (13→8) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `sort.effect` | sort | sort "views" reorders results (asc ≠ desc) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 279 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 58 page(s) |

## `weebcentral` — ✗ (4✓ 3⚠ 2✗)

**4/4 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✗ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ✗ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |

## `mangadex` — ⚠ (3✓ 1⚠ 3✗)

**3/3 capabilities** · cover —

> flaky (tolerated): Cloudflare challenges datacenter (runner) IPs

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✗ | `lists.threw` | lists | lists browse threw: getListItems threw: SyntaxError: JSON Parse error: Unrecognized token '<' |
| ✗ | `search.threw` | search | getSearchResults threw: getSearchResults threw: SyntaxError: JSON Parse error: Unrecognized token '<' |
| ✗ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: SyntaxError: JSON Parse error: Unrecognized token '<' |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 3 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |

_Updated 2026-10-21 by the nightly live audit ([`audit.ts`](audit.ts))._

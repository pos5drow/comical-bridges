# Bridge audit — detailed results

Per-check results from the live bridge audit — every conformance probe run against the real
backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an inconclusive
sort/filter probe — never a defect). Warnings never fail the run; a tolerated flaky/blocked bridge
shows ⚠ even for a hard failure.

## `atsumaru` — ⚠ (5✓ 6⚠ 0✗)

**6/7 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=*&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+%28mbContentRating%3A%3D%5B%60Safe%60%2C%60Suggestive%60%2C%60Erotica%60%5D+%7C%7C+mbContentRating%3A%21%3D*%29+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&sort_by=trending%3Adesc: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=spy&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+%28mbContentRating%3A%3D%5B%60Safe%60%2C%60Suggestive%60%2C%60Erotica%60%5D+%7C%7C+mbContentRating%3A%21%3D*%29+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1&num_typos=4%2C3%2C2%2C1: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=spy&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+%28mbContentRating%3A%3D%5B%60Safe%60%2C%60Suggestive%60%2C%60Erotica%60%5D+%7C%7C+mbContentRating%3A%21%3D*%29+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1&num_typos=4%2C3%2C2%2C1: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=spy&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+%28mbContentRating%3A%3D%5B%60Safe%60%2C%60Suggestive%60%2C%60Erotica%60%5D+%7C%7C+mbContentRating%3A%21%3D*%29+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&sort_by=views%3Aasc&query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1&num_typos=4%2C3%2C2%2C1: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `favorites.read` | favorites | getFavorites could not be read: getFavorites threw: Error: https://atsu.moe/api/user/bookmarksPage → 403 Forbidden |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 7 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |

## `weebcentral` — ⚠ (4✓ 5⚠ 0✗)

**4/4 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: Error: [rate-limited:300000] challenged by Cloudflare |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |

## `mangadex` — ⚠ (10✓ 1⚠ 0✗)

**3/3 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

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

_Updated 2026-11-05 by the nightly live audit ([`audit.ts`](audit.ts))._

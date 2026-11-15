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
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fweebcentral.com%2Fsearch%2Fdata%3Flimit%3D32%26offset%3D0%26sort%3DPopularity%26order%3DDescending%26official%3DAny%26display_mode%3DFull%2BDisplay\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F124.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fweebcentral.com%2Fsearch%2Fdata%3Flimit%3D32%26offset%3D0%26sort%3DPopularity%26order%3DDescending%26official%3DAny%26display_mode%3DFull%2BDisplay\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F124.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fweebcentral.com%2Fsearch%2Fdata%3Flimit%3D32%26offset%3D0%26sort%3DPopularity%26order%3DDescending%26official%3DAny%26display_mode%3DFull%2BDisplay\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F124.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fweebcentral.com%2Fsearch%2Fdata%3Flimit%3D32%26offset%3D0%26sort%3DPopularity%26order%3DDescending%26official%3DAny%26display_mode%3DFull%2BDisplay\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F124.0%20Safari%2F537.36] the site wants to check this is a person |
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

## `mangakakalot` — ⚠ (8✓ 4⚠ 0✗)

**5/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

> search is challenged by Cloudflare bot scoring

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.threw` | core | read path threw: getSeriesDetails threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "hot" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 3 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 2 descriptor(s) |

## `manganato` — ⚠ (8✓ 4⚠ 0✗)

**5/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

> search is challenged by Cloudflare bot scoring

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.manganato.gg%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.manganato.gg%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.manganato.gg%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.threw` | core | read path threw: getSeriesDetails threw: [challenge:https%3A%2F%2Fwww.manganato.gg%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "hot" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 3 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 2 descriptor(s) |

## `mangabat` — ✓ (13✓ 0⚠ 0✗ 2⊘)

**5/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

> search is challenged by Cloudflare bot scoring

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `filters.effect` | filters | applying filter "genre=4-koma" did not change the sampled page |
| ⊘ | `sort.effect` | sort | asc/desc on "topview" produced identical order |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "hot" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 20 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 20 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 3 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 2 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 3877 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 96 page(s) |

## `asurascans` — ✓ (14✓ 0⚠ 0✗)

**4/5 capabilities** · cover 233 KB (1003×1431) · sampled 8 · failed 0 · bytes min 134 KB / avg 233 KB / median 195 KB / max 513 KB · dims avg 1003×1431 (max 2000×2861) · aspect avg 0.70

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 11 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "status" changed results (11→8) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `sort.effect` | sort | sort "popular" reorders results (asc ≠ desc) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 349 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 23 page(s) |

## `olympus` — ⚠ (4✓ 5⚠ 0✗)

**5/5 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Folympusxyz.com%2Fapi%2Frankings%3Fperiod%3Dtotal_ranking%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Folympusxyz.com%2Fapi%2Frankings%3Fperiod%3Dtotal_ranking%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.threw` | filters | getFilters threw: getFilters threw: [challenge:https%3A%2F%2Folympusxyz.com%2Fapi%2Frankings%3Fperiod%3Dtotal_ranking%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Folympusxyz.com%2Fapi%2Frankings%3Fperiod%3Dtotal_ranking%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 1 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |

## `manhwaweb` — ⚠ (14✓ 1⚠ 0✗)

**4/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.author` | core | series details have no author |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "new" returned 8 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | single page (no nextCursor) |
| ✓ | `search.items` | search | search returned 30 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 2 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "tipo" changed results (30→16) |
| ✓ | `sort.options` | sort | getSortOptions returned 3 option(s) |
| ✓ | `sort.effect` | sort | sort "creacion" reorders results (asc ≠ desc) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 2 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 6 page(s) |

## `mangak` — ✓ (13✓ 0⚠ 0✗ 1⊘)

**4/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `sort.effect` | sort | asc/desc on "popular" produced identical order |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 24 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 24 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "status" changed results (24→24) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 181 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 237 page(s) |

## `toonilyme` — ✓ (13✓ 0⚠ 0✗ 1⊘)

**4/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⊘ | `sort.effect` | sort | asc/desc on "popular" produced identical order |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 24 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 24 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "status" changed results (24→24) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 337 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 28 page(s) |

## `mangataro` — ⚠ (10✓ 2⚠ 0✗ 2⊘)

**4/4 capabilities** · cover 545 KB (1149×1474) · sampled 8 · failed 0 · bytes min 1 KB / avg 545 KB / median 536 KB / max 1099 KB · dims avg 1149×1474 (max 1800×2560) · aspect avg 0.80

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.genres` | core | series details have no genre tag group (kind: "genre") |
| ⚠ | `read.chapters.empty` | core | series has no chapters |
| ⊘ | `filters.effect` | filters | applying filter "type=Manga" did not change the sampled page |
| ⊘ | `sort.effect` | sort | not enough results to observe sort order |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 23 further item(s) |
| ✓ | `search.items` | search | search returned 1 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |

## `roliascan` — ✓ (14✓ 0⚠ 0✗)

**4/4 capabilities** · cover 1017 KB (978×1385) · sampled 8 · failed 0 · bytes min 106 KB / avg 1017 KB / median 762 KB / max 3692 KB · dims avg 978×1385 (max 2000×2700) · aspect avg 0.70

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 115 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 120 further item(s) |
| ✓ | `search.items` | search | search returned 25 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "type" changed results (25→120) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |
| ✓ | `sort.effect` | sort | sort "popular" reorders results (asc ≠ desc) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 17 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 8 page(s) |

## `kingofshojo` — ⚠ (13✓ 1⚠ 0✗ 1⊘)

**4/4 capabilities** · cover 120 KB (600×1000) · sampled 8 · failed 0 · bytes min 88 KB / avg 120 KB / median 121 KB / max 162 KB · dims avg 600×1000 (max 600×1000) · aspect avg 0.60

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.author` | core | series details have no author |
| ⊘ | `sort.effect` | sort | asc/desc on "popular" produced identical order |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 40 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 40 further item(s) |
| ✓ | `search.items` | search | search returned 40 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 40 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "status" changed results (40→40) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 130 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 1 page(s) |

## `flamecomics` — ⚠ (2✓ 4⚠ 0✗)

**3/3 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fflamecomics.xyz\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fflamecomics.xyz\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.threw` | filters | getFilters threw: getFilters threw: [challenge:https%3A%2F%2Fflamecomics.xyz\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 3 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |

## `mangaball` — ⚠ (5✓ 5⚠ 0✗)

**5/6 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fmangaball.com%2Fapi%2Fv1%2Ftitle%2Fsearch-advanced%3Fpage%3D1%26limit%3D24%26tag_mode%3DAND%26adult_mode%3Dall%26chapterLanguage%3Den%26sort_by%3Dviews%26sort_order%3Ddesc\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fmangaball.com%2Fapi%2Fv1%2Ftitle%2Fsearch-advanced%3Fpage%3D1%26limit%3D24%26tag_mode%3DAND%26adult_mode%3Dall%26chapterLanguage%3Den%26sort_by%3Dviews%26sort_order%3Ddesc\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fmangaball.com%2Fapi%2Fv1%2Ftitle%2Fsearch-advanced%3Fpage%3D1%26limit%3D24%26tag_mode%3DAND%26adult_mode%3Dall%26chapterLanguage%3Den%26sort_by%3Dviews%26sort_order%3Ddesc\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fmangaball.com%2Fapi%2Fv1%2Ftitle%2Fsearch-advanced%3Fpage%3D1%26limit%3D24%26tag_mode%3DAND%26adult_mode%3Dall%26chapterLanguage%3Den%26sort_by%3Dviews%26sort_order%3Ddesc\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |

## `dynasty` — ⚠ (12✓ 3⚠ 0✗)

**3/3 capabilities** · cover — · sampled 0 · failed 0 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.item.thumbnail` | lists | lists items have no thumbnailUrl |
| ⚠ | `search.item.thumbnail` | search | search items have no thumbnailUrl |
| ⚠ | `read.details.description` | core | series details have no description |
| ✓ | `info.capabilities` | core | declares 3 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 1 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 21 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 19 further item(s) |
| ✓ | `search.items` | search | search returned 5 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 1 filter(s) |
| ✓ | `filters.effect` | filters | filter "classes" changed results (5→4) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 210 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 4 page(s) |

## `webtoons` — ✓ (13✓ 0⚠ 0✗)

**4/5 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 5 list(s) |
| ✓ | `lists.items` | lists | list "updated" returned 156 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | single page (no nextCursor) |
| ✓ | `search.items` | search | search returned 18 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 1 filter(s) |
| ✓ | `filters.effect` | filters | filter "kind" changed results (18→6) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 59 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 101 page(s) |

## `zonatmo` — ⚠ (4✓ 5⚠ 0✗)

**4/5 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fzonatmo.org%2Fbiblioteca%3Ftitle%3D%26filter_by%3Dtitle%26order_item%3Dlikes_count%26order_dir%3Ddesc%26_pg%3D1%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fzonatmo.org%2Fbiblioteca%3Ftitle%3D%26filter_by%3Dtitle%26order_item%3Dlikes_count%26order_dir%3Ddesc%26_pg%3D1%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fzonatmo.org%2Fbiblioteca%3Ftitle%3D%26filter_by%3Dtitle%26order_item%3Dlikes_count%26order_dir%3Ddesc%26_pg%3D1%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fzonatmo.org%2Fbiblioteca%3Ftitle%3D%26filter_by%3Dtitle%26order_item%3Dlikes_count%26order_dir%3Ddesc%26_pg%3D1%26page%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |

## `batcave` — ⚠ (4✓ 5⚠ 0✗)

**4/4 capabilities** · cover —

> DLE Guard wants a browser check first

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fbatcave.biz%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fbatcave.biz%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fbatcave.biz%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fbatcave.biz%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |

## `mangaplus` — ✓ (13✓ 0⚠ 0✗)

**4/4 capabilities** · cover 46 KB (352×528) · sampled 8 · failed 0 · bytes min 30 KB / avg 46 KB / median 46 KB / max 58 KB · dims avg 352×528 (max 352×528) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 4 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 74 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | single page (no nextCursor) |
| ✓ | `search.items` | search | search returned 1 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `filters.effect` | filters | filter "type" changed results (1→0) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 12 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 20 page(s) |

## `toonkotsu` — ⚠ (4✓ 5⚠ 0✗)

**4/5 capabilities** · cover —

> Cloudflare challenges the Bun/Node TLS fingerprint

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Ftoonkotsu.com%2Fcdn%2Fv1%2Fbrowse%3Fsort%3Dpopular%26order%3Ddesc%26page%3D1%26limit%3D42\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Ftoonkotsu.com%2Fcdn%2Fv1%2Fbrowse%3Fsort%3Dpopular%26order%3Ddesc%26page%3D1%26limit%3D42\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Ftoonkotsu.com%2Fcdn%2Fv1%2Fbrowse%3Fsort%3Dpopular%26order%3Ddesc%26page%3D1%26limit%3D42\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Ftoonkotsu.com%2Fcdn%2Fv1%2Fbrowse%3Fsort%3Dpopular%26order%3Ddesc%26page%3D1%26limit%3D42\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 8 option(s) |

## `mangago` — ⚠ (5✓ 5⚠ 0✗)

**5/6 capabilities** · cover —

> Cloudflare challenges the Bun/Node TLS fingerprint

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fwww.mangago.me%2Fgenre%2Fall%2F1%2F%3Ff%3D1%26o%3D1%26sortby%3Dview%26e%3D\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.mangago.me%2Fgenre%2Fall%2F1%2F%3Ff%3D1%26o%3D1%26sortby%3Dview%26e%3D\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.mangago.me%2Fgenre%2Fall%2F1%2F%3Ff%3D1%26o%3D1%26sortby%3Dview%26e%3D\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.mangago.me%2Fgenre%2Fall%2F1%2F%3Ff%3D1%26o%3D1%26sortby%3Dview%26e%3D\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |

## `mangafire` — ⚠ (5✓ 5⚠ 0✗)

**5/6 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fmangafire.to%2Fapi%2Ftitles%3Flanguages%255B%255D%3Den%26limit%3D50%26order%255Bviews_30d%255D%3Ddesc%26page%3D1%26vrf%3D8sK3xtqdFZdDWTKuDVd13pWwhD44iM3livd8XbC0A2LleSdV44JJHt-XhAc2dQlCxBg_vIDx03846DWcLw\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fmangafire.to%2Fapi%2Ftitles%3Flanguages%255B%255D%3Den%26limit%3D50%26order%255Bviews_30d%255D%3Ddesc%26page%3D1%26vrf%3D8sK3xtqdFZdDWTKuDVd13pWwhD44iM3livd8XbC0A2LleSdV44JJHt-XhAc2dQlCxBg_vIDx03846DWcLw\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fmangafire.to%2Fapi%2Ftitles%3Flanguages%255B%255D%3Den%26limit%3D50%26order%255Bviews_30d%255D%3Ddesc%26page%3D1%26vrf%3D8sK3xtqdFZdDWTKuDVd13pWwhD44iM3livd8XbC0A2LleSdV44JJHt-XhAc2dQlCxBg_vIDx03846DWcLw\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fmangafire.to%2Fapi%2Ftitles%3Flanguages%255B%255D%3Den%26limit%3D50%26order%255Bviews_30d%255D%3Ddesc%26page%3D1%26vrf%3D8sK3xtqdFZdDWTKuDVd13pWwhD44iM3livd8XbC0A2LleSdV44JJHt-XhAc2dQlCxBg_vIDx03846DWcLw\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 4 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 10 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |

## `cubari` — ⚠ (6✓ 1⚠ 0✗)

**1/1 capabilities** · cover 30 KB (400×600) · sampled 1 · failed 0 · bytes min 30 KB / avg 30 KB / median 30 KB / max 30 KB · dims avg 400×600 (max 400×600) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.details.genres` | core | series details have no genre tag group (kind: "genre") |
| ✓ | `info.capabilities` | core | declares 1 capability(ies) |
| ✓ | `search.items` | search | search returned 1 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 674 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 1 page(s) |

_Updated 2026-11-15 by the nightly live audit ([`audit.ts`](audit.ts))._

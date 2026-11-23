# Bridge audit — detailed results

Per-check results from the live bridge audit — every conformance probe run against the real
backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an inconclusive
sort/filter probe — never a defect). Warnings never fail the run; a tolerated flaky/blocked bridge
shows ⚠ even for a hard failure.

## `atsumaru` — ⚠ (5✓ 6⚠ 0✗)

**6/7 capabilities** · cover —

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=*&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+mbContentRating%3A%21%3D%5B%60Pornographic%60%5D+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&sort_by=trending%3Adesc: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=spy&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+mbContentRating%3A%21%3D%5B%60Pornographic%60%5D+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1&num_typos=4%2C3%2C2%2C1: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=spy&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+mbContentRating%3A%21%3D%5B%60Pornographic%60%5D+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1&num_typos=4%2C3%2C2%2C1: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: Error: atsu.moe answered HTTP 403 for https://atsu.moe/collections/manga/documents/search?q=spy&filter_by=hidden%3A%21%3Dtrue+%26%26+isAdult%3A%3Dfalse+%26%26+mbContentRating%3A%21%3D%5B%60Pornographic%60%5D+%26%26+medium%3A%21%3D%5B%60Novel%60%5D+%26%26+views%3A%3E0&page=1&per_page=40&sort_by=views%3Aasc&query_by=title%2CenglishTitle%2CotherNames%2Cauthors&query_by_weights=4%2C3%2C2%2C1&num_typos=4%2C3%2C2%2C1: <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <! |
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

## `mangakakalot` — ⚠ (5✓ 4⚠ 1✗)

**5/5 capabilities** · cover —

> flaky (tolerated): search is challenged by Cloudflare bot scoring

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✗ | `lists.threw` | lists | lists browse threw: getListItems threw: Error: redirected to mangagoku.com, which isn't one of the site's known domains — it may have moved. Try another domain in this source's settings, or update the bridge. |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fwww.kakamanga.com%2Fsearch%2Fstory%2Fsolo_leveling%3Fpage%3D1\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 3 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 2 descriptor(s) |

## `manganato` — ⚠ (8✓ 4⚠ 0✗)

**5/5 capabilities** · cover 33 KB (289×415) · sampled 8 · failed 0 · bytes min 8 KB / avg 33 KB / median 22 KB / max 80 KB · dims avg 289×415 (max 460×690) · aspect avg 0.70

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

**5/5 capabilities** · cover 33 KB (289×415) · sampled 8 · failed 0 · bytes min 8 KB / avg 33 KB / median 22 KB / max 80 KB · dims avg 289×415 (max 460×690) · aspect avg 0.70

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

**4/5 capabilities** · cover 191 KB (845×1231) · sampled 8 · failed 0 · bytes min 64 KB / avg 191 KB / median 195 KB / max 291 KB · dims avg 845×1231 (max 976×1612) · aspect avg 0.69

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "popular" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 12 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "status" changed results (12→8) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `sort.effect` | sort | sort "popular" reorders results (asc ≠ desc) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 350 ordered, uniquely-identified chapter(s) |
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

## `manhwaweb` — ✓ (14✓ 0⚠ 0✗)

**4/5 capabilities** · cover 140 KB (781×1013) · sampled 8 · failed 0 · bytes min 44 KB / avg 140 KB / median 119 KB / max 384 KB · dims avg 781×1013 (max 1086×1500) · aspect avg 0.86

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "new" returned 8 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | single page (no nextCursor) |
| ✓ | `search.items` | search | search returned 30 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 3 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 5 filter(s) |
| ✓ | `filters.effect` | filters | filter "tipo" changed results (30→17) |
| ✓ | `sort.options` | sort | getSortOptions returned 3 option(s) |
| ✓ | `sort.effect` | sort | sort "creacion" reorders results (asc ≠ desc) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 4 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 21 page(s) |

## `mangak` — ✓ (13✓ 0⚠ 0✗ 1⊘)

**4/5 capabilities** · cover 12 KB (206×250) · sampled 8 · failed 0 · bytes min 7 KB / avg 12 KB / median 12 KB / max 15 KB · dims avg 206×250 (max 225×348) · aspect avg 0.93

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
| ✓ | `read.chapters` | core | got 268 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 61 page(s) |

## `toonilyme` — ✓ (13✓ 0⚠ 0✗ 1⊘)

**4/5 capabilities** · cover 14 KB (208×300) · sampled 8 · failed 0 · bytes min 11 KB / avg 14 KB / median 14 KB / max 18 KB · dims avg 208×300 (max 215×300) · aspect avg 0.69

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
| ✓ | `read.chapters` | core | got 157 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 15 page(s) |

## `mangataro` — ⚠ (10✓ 1⚠ 0✗ 2⊘)

**4/4 capabilities** · cover 496 KB (1163×1515) · sampled 8 · failed 0 · bytes min 1 KB / avg 496 KB / median 406 KB / max 1099 KB · dims avg 1163×1515 (max 1800×2560) · aspect avg 0.79

| Result | Check | Capability | Detail |
|:--:|---|---|---|
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

**4/4 capabilities** · cover 858 KB (1475×2111) · sampled 8 · failed 0 · bytes min 166 KB / avg 858 KB / median 981 KB / max 1373 KB · dims avg 1475×2111 (max 3024×4299) · aspect avg 0.70

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 120 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 114 further item(s) |
| ✓ | `search.items` | search | search returned 25 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 3 filter(s) |
| ✓ | `filters.effect` | filters | filter "type" changed results (25→120) |
| ✓ | `sort.options` | sort | getSortOptions returned 4 option(s) |
| ✓ | `sort.effect` | sort | sort "popular" reorders results (asc ≠ desc) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 107 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 11 page(s) |

## `kingofshojo` — ⚠ (13✓ 1⚠ 0✗ 1⊘)

**4/4 capabilities** · cover 135 KB (600×1000) · sampled 8 · failed 0 · bytes min 107 KB / avg 135 KB / median 134 KB / max 162 KB · dims avg 600×1000 (max 600×1000) · aspect avg 0.60

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
| ✓ | `read.chapters` | core | got 132 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 11 page(s) |

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

## `dynasty` — ⚠ (12✓ 2⚠ 0✗)

**3/3 capabilities** · cover — · sampled 0 · failed 0 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.item.thumbnail` | lists | lists items have no thumbnailUrl |
| ⚠ | `search.item.thumbnail` | search | search items have no thumbnailUrl |
| ✓ | `info.capabilities` | core | declares 3 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 1 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 23 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 16 further item(s) |
| ✓ | `search.items` | search | search returned 5 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 1 filter(s) |
| ✓ | `filters.effect` | filters | filter "classes" changed results (5→4) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 68 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 16 page(s) |

## `webtoons` — ✓ (13✓ 0⚠ 0✗)

**4/5 capabilities** · cover 94 KB (480×623) · sampled 8 · failed 0 · bytes min 59 KB / avg 94 KB / median 97 KB / max 113 KB · dims avg 480×623 (max 480×623) · aspect avg 0.77

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 5 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 5 list(s) |
| ✓ | `lists.items` | lists | list "updated" returned 154 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | single page (no nextCursor) |
| ✓ | `search.items` | search | search returned 18 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 1 filter(s) |
| ✓ | `filters.effect` | filters | filter "kind" changed results (18→6) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 60 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 95 page(s) |

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

## `kagane` — ⚠ (5✓ 5⚠ 0✗)

**5/6 capabilities** · cover —

> Cloudflare check needs a browser

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fkagane.moe%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fkagane.moe%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fkagane.moe%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fkagane.moe%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 7 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 9 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 2 descriptor(s) |

## `onisaga` — ⚠ (5✓ 5⚠ 0✗)

**5/6 capabilities** · cover —

> Cloudflare check needs a browser

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `lists.threw` | lists | lists browse threw: getListItems threw: [challenge:https%3A%2F%2Fonisaga.com%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `search.threw` | search | getSearchResults threw: getSearchResults threw: [challenge:https%3A%2F%2Fonisaga.com%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `filters.effect` | filters | applying a filter threw: getSearchResults threw: [challenge:https%3A%2F%2Fonisaga.com%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `sort.effect` | sort | applying a sort threw: getSearchResults threw: [challenge:https%3A%2F%2Fonisaga.com%2F\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⚠ | `read.noSample` | core | no item available to sample the read path (search/lists returned nothing) |
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 2 list(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 10 filter(s) |
| ✓ | `sort.options` | sort | getSortOptions returned 5 option(s) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |

## `mangadot` — ✓ (15✓ 0⚠ 0✗)

**5/6 capabilities** · cover 78 KB (631×937) · sampled 8 · failed 0 · bytes min 28 KB / avg 78 KB / median 47 KB / max 222 KB · dims avg 631×937 (max 894×1280) · aspect avg 0.67

> Cloudflare check needs a browser

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 6 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 53 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 55 further item(s) |
| ✓ | `search.items` | search | search returned 53 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 56 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 11 filter(s) |
| ✓ | `filters.effect` | filters | filter "origin" changed results (53→53) |
| ✓ | `sort.options` | sort | getSortOptions returned 6 option(s) |
| ✓ | `sort.effect` | sort | sort "latest" reorders results (asc ≠ desc) |
| ✓ | `settings.descriptors` | settings | getSettings returned 1 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 180 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 34 page(s) |

## `lectorxd` — ⚠ (10✓ 1⚠ 0✗ 1⊘)

**4/4 capabilities** · cover — · sampled 0 · failed 8 · bytes min 0 KB / avg 0 KB / median 0 KB / max 0 KB

> Cloudflare check on series and reader pages needs a browser

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ⚠ | `read.threw` | core | read path threw: getSeriesDetails threw: [challenge:https%3A%2F%2Flectorxd.com%2Fmanga%2Fsenryu-shoujo\|Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F130.0%20Safari%2F537.36] the site wants to check this is a person |
| ⊘ | `sort.effect` | sort | asc/desc on "recent" produced identical order |
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 3 list(s) |
| ✓ | `lists.items` | lists | list "recent" returned 24 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | nextCursor advanced to 24 further item(s) |
| ✓ | `search.items` | search | search returned 24 item(s) |
| ✓ | `search.cursor` | search | nextCursor advanced to 23 further item(s) |
| ✓ | `filters.descriptors` | filters | getFilters returned 4 filter(s) |
| ✓ | `filters.effect` | filters | filter "types" changed results (24→13) |
| ✓ | `sort.options` | sort | getSortOptions returned 7 option(s) |

## `mangaplus` — ✓ (13✓ 0⚠ 0✗)

**4/4 capabilities** · cover 29 KB (352×528) · sampled 8 · failed 0 · bytes min 17 KB / avg 29 KB / median 31 KB / max 37 KB · dims avg 352×528 (max 352×528) · aspect avg 0.67

| Result | Check | Capability | Detail |
|:--:|---|---|---|
| ✓ | `info.capabilities` | core | declares 4 capability(ies) |
| ✓ | `lists.catalog` | lists | getLists returned 4 list(s) |
| ✓ | `lists.items` | lists | list "latest" returned 78 item(s) |
| ✓ | `lists.idStability` | lists | list item ids are stable across calls |
| ✓ | `lists.cursor` | lists | single page (no nextCursor) |
| ✓ | `search.items` | search | search returned 1 item(s) |
| ✓ | `search.cursor` | search | single page (no nextCursor) |
| ✓ | `filters.descriptors` | filters | getFilters returned 2 filter(s) |
| ✓ | `filters.effect` | filters | filter "type" changed results (1→0) |
| ✓ | `settings.descriptors` | settings | getSettings returned 3 descriptor(s) |
| ✓ | `read.detailsRoundTrip` | core | details round-trip the sampled id |
| ✓ | `read.chapters` | core | got 12 ordered, uniquely-identified chapter(s) |
| ✓ | `read.pages` | core | got 18 page(s) |

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

_Updated 2026-11-23 by the nightly live audit ([`audit.ts`](audit.ts))._

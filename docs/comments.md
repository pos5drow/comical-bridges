# Comments: source survey

Surveyed 2026-11-15, read-only: no logins, posts or votes. This is the per-site half of the
comments plan. The design is in comical's `docs/comments-plan.md`, which names no sites.
V = verified live or in the site's public JS. I = inferred. "Both" = a series thread plus one
thread per chapter.

**Built:** Asura Scans (read-only; series and chapter threads, Best/Newest/Oldest, replies). It needs
comical's contract 2.2.

**No site comments per page.** The bridges hold no auth today, except Atsumaru's login.

| Bridge | Scope | Provider / read endpoint | Threading | Votes / reactions | Write needs | Order |
|---|---|---|---|---|---|---|
| asurascans | both | JSON `api…/series/{numericId}/comments`, `/chapters/{id}/comments`, `/comments/{id}/replies`; 20/page, `meta.has_more` (V) | nested, lazy | up/down | account | 1 |
| flamecomics | both | JSON `/api/comments/get?path=/series/{id}[/{token}]&sort=best\|new\|old`, replies `/api/comments/{id}/get` (V); body is HTML | nested, lazy | like/dislike | session | 1 |
| webtoons | chapter | JSON `/p/api/community/v2/posts?pageId=w_{title}_{ep}` (Canvas `c_`), header `Service-Ticket-Id: epicom`; top: `v1/page/{pageId}/posts/search`; replies `v2/post/{id}/child-posts` (V) | 1 level, lazy | like/dislike, top, creator badge | login cookie + `Api-Token` from `v1/api-token` | 1 |
| atsumaru | chapter | `getCommentSection?chapterId&create=false` → section (null = no thread); `v2/threads?sectionId&parentId&cursor&maxDepth&sort=top\|best\|hot\|newest\|oldest` (V) | nested | score/up/down | **login already exists** → first write target | 1 |
| mangak, toonilyme | both | MadTheme JSON `api.<host>/comments/title/{id}?sort=newest\|top&include_chapter_comments=1`, `/comments/chapter/{id}`, `/comments/{id}/replies` (V); body is HTML | 1 level, lazy | like/dislike + ~8 emoji | Bearer | 2 (engine) |
| mangakakalot, manganato, mangabat | both | MangaBox `/api/comments/list?commentable_type=comics\|chapters&commentable_id=…&page&direction` (V), 10/page; threads are separate per domain | embedded `children` | like/dislike | session + CSRF | 2 (engine) |
| mangataro, roliascan | both | `/auth/comments?content_id&content_type=manga\|chapter&sort=top\|new&page` (V); markdown-ish `\|\|spoiler\|\|` | nested ≤3 | up/down | cookie session | 2 (engine) |
| toonkotsu | both | `/api/v1/community?seriesId[&chapterId]&sort&offset&limit&parentId` (V); markdown with images | 1 level, lazy | score + chapter emoji | session + `x-owner` | 2 |
| weebcentral | both | htmx HTML `/comments/contents/{ulid}?content_type=series\|chapter&cursor` (V), replies `/comments/{id}/replies` | 1 level, lazy | likes | verified account | 2 |
| mangaplus | chapter | protobuf `GET /comment?chapter_id=` → `CommentListView` (V); all comments in one response; per-chapter count is in the chapter list (field 14) | flat | likes | app account; web can only like | 2 |
| mangaball | both | `POST /api/v1/comment/load-comments {object_id, object_type, filter_type, page, limit}` (V) | flat | likes | **skip writes**: the server appears to trust user fields sent by the client | 3 |
| olympus | both | Crowment embed `api.crowment.com/api/comments/tree?page_id=comic-{id}[-{ch}]&app_key=…&sort` (V) | 1 level | likes + emoji | Crowment account | 3 |
| zonatmo | series (chapter: emoji only) | series HTML already fetched, `.c-item`; chapter reactions JSON `/chapters/{id}/reactions` (V) | 1 level inline | 6 reactions | session + CSRF | 3 |
| kingofshojo | both | WordPress `ol.comment-list` in page HTML (V); REST 401 | nested | none | guest name+email | 3 |
| dynasty | series forum topic | "Discuss this chapter" link in chapter HTML → `/forum/topics/{id}`, 25/page HTML (V) | flat + quotes | none | forum account | 3 |
| mangadex | both (+group) | `statistics/{manga\|chapter}` → `comments{threadId, repliesCount}` (null = no thread); XenForo HTML `forums.mangadex.org/threads/{id}/page-N` (V) | flat + quotes | XenForo reactions | no posting API: XenForo form + SSO session (**read-only**) | 3 |
| mangago | series "topics" | `POST /r/ajax/getmangatopiclist/` HTML fragment (V); site in maintenance | nested | agree/disagree | account | 4 |
| manhwaweb | both | IntenseDebate JS-wrapped HTML (V) | nested | votes | IntenseDebate account (**read-only**) | 4 |
| batcave | series | DLE HTML on the series page, `CommentsPage(n,id)` (fixture) | nested | +/- | guest or account, moderated | 4 |
| lectorxd | both (I) | `/api/comments/manga/{id}`, `/api/comments/chapter/{id}` answer, but empty on the samples | ? | ? | account | 4 |
| mangadot | both (counts in fixtures) | CF-walled; `commentsData` sits in the series route data | ? | ? | ? | 4 |
| kagane, onisaga | unknown (CF-walled) | – | – | – | – | – |
| cubari, mangafire | **none** | – | – | – | – | – |

**Free counts** (no extra request): MangaPlus per-chapter, MangaDot per-chapter, MangaBox
`comment_count`, ZonaTMO `#comment-count`, and Dynasty's link count. MangaDex costs one statistics
request, batched across chapters.

**Image hosts to add** when a bridge renders inline media: GIPHY and Tenor/Klipy (Webtoons, Atsumaru,
Asura `gif_url`), and the site's own `/pic/` paths (Toonkotsu).

**Order.** 1 = clean JSON and high value; 2 = shared engines, which cover several sites at once; 3 =
HTML or third-party embeds; 4 = walled, stale or unverified. Writes start with Atsumaru, which
already holds a login, then sites that get a `web-login` setting.

## How the sites display them

From a read-only browser survey on 2026-11-17; the app's thread UI copies the consensus. Defaults
are in bold.

| Site | Placement | Sort UI | Replies | Pagination |
|---|---|---|---|---|
| webtoons | after the episode | tabs **TOP** / NEWEST; "TOP" chip on comments | 1 level, "Replies N" inset | "More" button |
| asurascans | series: under the chapter list (Comment/Review tabs); chapter: after the last page | pill **Best** / New / Old | 2 levels; first 3, then "Show N more" | "Load More" |
| flamecomics | series: after Similar Titles; chapter: after reactions | pill **Best** / Newest / Oldest | nested with connector lines | all at once; no count shown |
| weebcentral | behind a "Click to reveal comments" bar | none (newest) | 2 levels | infinite (I) |
| mangak | series: inline; reader: right drawer | **Relevant** / Top / Worst / Newest / Oldest | expanded; "↳ Name *quote*" reply context | "N more threads" |
| atsumaru | "Comments N" tab; chapter: under the end nav | dropdown **Relevant** / Top / Worst / New / Old (the API also has best/hot) | nested, Reddit-style collapse | – |
| mangadex | "Comments (N)" tab, plus 💬 N on chapter rows; logged out, it only links to the forum | – | – | forum |
| manganato | inline under the summary / after the pages | dropdown **Latest** / Oldest | left rule | "Load more" |
| mangaplus | 💬 on chapter rows → comments page | pills **Likes** / Latest | flat | all at once |
| toonkotsu | reader toolbar → overlay | **NEWEST** / BEST / OLDEST | – | – |

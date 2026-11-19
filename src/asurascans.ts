/**
 * Asura Scans bridge — https://asurascans.com
 *
 * Everything comes from the site's JSON API (`api.asurascans.com/api`):
 *  - lists/search: `/series?offset&limit&sort&order&search&status&type&genres`
 *  - details + recommendations: `/series/{slug}`
 *  - chapters: `/series/{slug}/chapters` (the whole list, newest first)
 *  - pages: `/series/{slug}/chapters/{number}`
 *  - comments: `/series/{numericId}/comments`, `/chapters/{chapterId}/comments` (20 a page by
 *    `offset`, `sort=top|newest|oldest`) and `/comments/{id}/replies` (every reply at once). Both
 *    threads want the API's numeric ids, not the slug and chapter number the bridge uses, so those
 *    are looked up once per series and kept.
 *
 * Ids are the API's stable series slug (`overgeared`) and the chapter number (`348`). The website's
 * own URLs add a random suffix (`/comics/overgeared-f212c582`) that rotates; `resolveUrl` strips it.
 *
 * Premium and early-access chapters need a paid account and come back with no pages, so they're left
 * out of the chapter list. Pages served cut into a tile grid (`tiles`, `tile_cols`, `tile_rows`, where
 * `tiles[i]` is the destination of source tile `i`) are marked for processing and laid out with
 * `tileLayout` — Keiyoushi applies that grid to its premium pages; no free page carried one when this
 * was written (2026-11-15).
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Comment,
  type CommentInlineNode,
  type CommentPage,
  type CommentsRequest,
  type Filter,
  type HttpResponse,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PageImageLayout,
  type PageImageLayoutRequest,
  type PagedResults,
  type RelatedSeriesGroup,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SortOption,
  type TagGroup,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
  tileLayout,
} from "@comical/sdk";
import { parseAbsoluteDate, parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { hintsForType } from "./cover-hints";
import { bridgeIcon } from "./core/icon";

const SITE = "https://asurascans.com";
const API = "https://api.asurascans.com/api";
const PER_PAGE = 24;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** The website's rotating suffix on a series slug (`overgeared-f212c582`). */
const RANDOM_SUFFIX = /-[a-z0-9]{8}$/;

interface GenreDto {
  name: string;
  slug: string;
}

interface SeriesDto {
  /** The API's numeric id, which the comment routes want. */
  id?: number | null;
  slug: string;
  title: string;
  cover?: string | null;
  cover_url?: string | null;
  alt_titles?: string[] | null;
  description?: string | null;
  status?: string | null;
  type?: string | null;
  author?: string | null;
  artist?: string | null;
  rating?: number | null;
  chapter_count?: number | null;
  public_url?: string | null;
  genres?: GenreDto[] | null;
}

interface ChapterDto {
  /** The API's numeric id, which the comment routes want. */
  id?: number | null;
  number: number;
  title?: string | null;
  is_premium?: boolean;
  early_access_until?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

interface PageDto {
  url: string;
  tiles?: number[] | null;
  tile_cols?: number | null;
  tile_rows?: number | null;
}

interface CommentDto {
  id: number;
  content?: string | null;
  created_at?: string | null;
  upvotes?: number | null;
  downvotes?: number | null;
  gif_url?: string | null;
  media_urls?: string[] | null;
  is_edited?: boolean | null;
  is_pinned?: boolean | null;
  reply_count?: number | null;
  user?: {
    username?: string | null;
    profile_picture_url?: string | null;
    role?: string | null;
    is_premium?: boolean | null;
  } | null;
}

const COMMENTS_PER_PAGE = 20;
const COMMENT_SORTS = [
  { id: "top", label: "Best" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

/**
 * A comment's text as nodes: `||…||` is the site's spoiler markup, and a reply opens with the
 * `@name` it answers.
 */
export function asuraCommentBody(content: string): CommentInlineNode[] {
  const nodes: CommentInlineNode[] = [];
  let text = content.replace(/\r\n?/g, "\n").trim();
  const mention = /^@([\w.-]{1,40})\s*/.exec(text);
  if (mention) {
    nodes.push({ type: "mention", name: mention[1]! });
    text = text.slice(mention[0].length);
    if (text) nodes.push({ type: "text", text: " " });
  }
  // Odd segments sit between a pair of `||`; an unpaired one is left as typed.
  const parts = text.split("||");
  const paired = parts.length % 2 === 1 ? parts : [...parts.slice(0, -2), `${parts.at(-2)}||${parts.at(-1)}`];
  paired.forEach((part, i) => {
    const spoiler = i % 2 === 1;
    part.split("\n").forEach((line, j) => {
      if (j > 0) nodes.push({ type: "break" });
      if (line) nodes.push({ type: "text", text: line, ...(spoiler ? { spoiler: true } : {}) });
    });
  });
  return nodes;
}

function commentRole(role: string | null | undefined): Comment["author"]["role"] {
  switch ((role ?? "").toLowerCase()) {
    case "admin":
    case "owner":
    case "staff":
      return "staff";
    case "moderator":
    case "mod":
      return "moderator";
    default:
      return undefined;
  }
}

function toComment(c: CommentDto, parentId?: string): Comment {
  const name = c.user?.username?.trim() || "Anonymous";
  const role = commentRole(c.user?.role);
  const body: Comment["body"] = asuraCommentBody(c.content ?? "");
  // A GIF is its own field, and usually repeated in `media_urls`.
  const media = [...new Set([c.gif_url, ...(c.media_urls ?? [])].filter((u): u is string => !!u))];
  for (const url of media) {
    if (body.length) body.push({ type: "break" });
    body.push({ type: "image", url, ...(/\/gifs\/|\.gif(?:$|\?)/i.test(url) ? { animated: true } : {}) });
  }
  const comment: Comment = {
    id: String(c.id),
    author: {
      name,
      ...(c.user?.profile_picture_url ? { avatar: c.user.profile_picture_url } : {}),
      ...(role ? { role } : {}),
      ...(c.user?.is_premium ? { badges: ["Premium"] } : {}),
    },
    body,
    votes: { up: Math.max(0, c.upvotes ?? 0), down: Math.max(0, c.downvotes ?? 0) },
  };
  if (parentId) comment.parentId = parentId;
  const at = parseAbsoluteDate(c.created_at ?? "");
  if (at !== undefined) comment.createdAt = at;
  if (c.is_edited) comment.edited = true;
  if (c.is_pinned) comment.pinned = true;
  if (c.reply_count && c.reply_count > 0) comment.replyCount = c.reply_count;
  return comment;
}

const SORTS: ReadonlyArray<SortOption> = [
  { key: "popular", label: "Popular" },
  { key: "latest", label: "Latest update" },
  { key: "rating", label: "Rating" },
  { key: "title", label: "Title" },
  { key: "update", label: "Newest" },
];

interface ListDef extends SeriesList {
  sort: string;
}

const LISTS: ReadonlyArray<ListDef> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true, sort: "popular" },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, sort: "latest" },
];

/** HTML in a description (the API leaves stray tags) as plain text. */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function isLocked(c: ChapterDto, now: number): boolean {
  if (c.is_premium) return true;
  const until = c.early_access_until ? parseAbsoluteDate(c.early_access_until) : undefined;
  return until !== undefined && until > now;
}

/** A context value read back as the grid it was written from, or undefined if it isn't one. */
function gridFrom(ctx: Record<string, string>): { cols: number; rows: number; tiles: number[] } | undefined {
  const cols = Number(ctx["cols"]);
  const rows = Number(ctx["rows"]);
  let tiles: unknown;
  try {
    tiles = JSON.parse(ctx["tiles"] ?? "");
  } catch {
    return undefined;
  }
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return undefined;
  if (!Array.isArray(tiles) || tiles.length !== cols * rows || !tiles.every((t) => Number.isInteger(t))) return undefined;
  return { cols, rows, tiles: tiles as number[] };
}

class AsuraScansBridge extends BridgeBase {
  /**
   * The platform User-Agent when the host gives a browser one (what its web check's web view sends),
   * else a fixed desktop Chrome one. A challenge answered in a web view with a borrowed User-Agent
   * never clears, so a bridge behind Cloudflare sends the platform's.
   */
  private get ua(): string {
    const host = this.userAgent;
    return host && host.startsWith("Mozilla/5.0") ? host : UA;
  }

  readonly info: BridgeInfo = {
    id: "pos5drow.asurascans",
    name: "Asura Scans",
    version: "0.2.0",
    contractVersion: "2.2.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "related-series", "comments"],
    // A thread on every series and every chapter, with likes and dislikes, replies one level down.
    comments: { scopes: ["series", "chapter"], sorts: COMMENT_SORTS, votes: "up-down", maxDepth: 2 },
    iconUrl: bridgeIcon("asurascans"),
    ratings: true,
    // The site's own client paces API calls to about one a second.
    rateLimit: { maxConcurrent: 1, minIntervalMs: 1000 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    images: { hosts: ["asurascans.com"], process: { layout: true } },
    linkHosts: ["asurascans.com"],
    coverForm: "scroll",
    readingDirection: "vertical",
  };

  private readonly guards = standardGuards(["asurascans.com"]);
  private genres: GenreDto[] | undefined;
  /** Per series slug: the API's numeric id and the site's page for it (comments want both). */
  private readonly seriesKeys = new Map<string, { id: number; url?: string }>();
  /** Per series slug: chapter number → the API's chapter id. */
  private readonly chapterKeys = new Map<string, Map<string, number>>();

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async api<T>(path: string): Promise<T> {
    const res = await this.request({
      url: `${API}${path}`,
      headers: { "User-Agent": this.ua, Accept: "application/json", Referer: `${SITE}/`, Origin: SITE },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`Asura Scans answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Asura Scans sent something that isn't JSON for ${path}`);
    }
  }

  private entry(s: SeriesDto): SeriesEntry {
    const entry: SeriesEntry = { id: s.slug, title: s.title, ...hintsForType(s.type ?? undefined) };
    const cover = s.cover ?? s.cover_url;
    if (cover) entry.thumbnailUrl = cover;
    return entry;
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  private async browse(page: number, params: Record<string, string>): Promise<PagedResults<SeriesEntry>> {
    const q = new URLSearchParams({ offset: String((page - 1) * PER_PAGE), limit: String(PER_PAGE), ...params });
    const res = await this.api<{ data?: SeriesDto[] | null; meta?: { has_more?: boolean } | null }>(`/series?${q}`);
    return { items: (res.data ?? []).map((s) => this.entry(s)), nextCursor: nextPageCursor(page, !!res.meta?.has_more) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _s, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.browse(pageFromCursor(req.cursor), { sort: list.sort, order: "desc" });
  }

  async getFilters(): Promise<Filter[]> {
    this.genres ??= (await this.api<{ data?: GenreDto[] | null }>("/genres")).data ?? [];
    return [
      {
        type: "select",
        key: "status",
        label: "Status",
        options: [
          { value: "ongoing", label: "Ongoing" },
          { value: "completed", label: "Completed" },
          { value: "hiatus", label: "Hiatus" },
          { value: "dropped", label: "Dropped" },
        ],
      },
      {
        type: "select",
        key: "type",
        label: "Type",
        options: [
          { value: "manhwa", label: "Manhwa" },
          { value: "manhua", label: "Manhua" },
          { value: "manga", label: "Mangatoon" },
        ],
      },
      {
        type: "multiselect",
        key: "genres",
        label: "Genres",
        options: this.genres.map((g) => ({ value: g.slug, label: g.name })),
      },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const params: Record<string, string> = {
      sort: req.sort?.key ?? "popular",
      order: req.sort?.ascending ? "asc" : "desc",
    };
    if (req.text.trim()) params["search"] = req.text.trim();
    for (const f of req.filters ?? []) {
      if ((f.key === "status" || f.key === "type") && typeof f.value === "string" && f.value) params[f.key] = f.value;
      if (f.key === "genres" && Array.isArray(f.value) && f.value.length) params["genres"] = f.value.join(",");
    }
    return this.browse(pageFromCursor(req.cursor), params);
  }

  // ── Details ─────────────────────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { series: s } = await this.api<{ series: SeriesDto }>(`/series/${encodeURIComponent(seriesId)}`);
    this.rememberSeries(seriesId, s);
    const info: SeriesInfo = { ...this.entry(s), id: seriesId };
    if (s.public_url) info.shareUrl = `${SITE}${s.public_url}`;
    if (s.description) info.description = plainText(s.description);
    if (s.alt_titles?.length) info.altTitles = s.alt_titles.filter((t) => t.trim());
    const status = parseStatus(s.status === "axed" ? "cancelled" : s.status);
    if (status !== "unknown") info.status = status;
    if (s.type) info.type = s.type[0]!.toUpperCase() + s.type.slice(1);
    const names = (v?: string | null) => (v ?? "").split(/\s*\/\s*|\s*,\s*/).map((n) => n.trim()).filter(Boolean);
    const authors = names(s.author);
    const artists = names(s.artist);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    if (s.genres?.length) {
      const tagGroups: TagGroup[] = [{ label: "Genres", kind: "genre", tags: s.genres.map((g) => g.name) }];
      info.tagGroups = tagGroups;
    }
    if (typeof s.rating === "number" && s.rating > 0 && s.rating <= 10) info.rating = { score: s.rating / 10 };
    return info;
  }

  async getRelatedSeries(seriesId: string): Promise<RelatedSeriesGroup[]> {
    const res = await this.api<{ recommended_series?: SeriesDto[] | null }>(`/series/${encodeURIComponent(seriesId)}`);
    const series = (res.recommended_series ?? []).map((s) => this.entry(s));
    return series.length ? [{ label: "Recommended", kind: "recommended", series }] : [];
  }

  // ── Chapters & pages ────────────────────────────────────────────────────────

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const res = await this.api<{ data?: ChapterDto[] | null }>(`/series/${encodeURIComponent(seriesId)}/chapters`);
    this.rememberChapters(seriesId, res.data ?? []);
    const now = Date.now();
    return (res.data ?? [])
      .filter((c) => !isLocked(c, now))
      .map((c) => {
        const ch: Chapter = {
          id: String(c.number),
          name: c.title?.trim() ? `Chapter ${c.number} - ${c.title.trim()}` : `Chapter ${c.number}`,
          number: c.number,
        };
        const at = parseAbsoluteDate(c.published_at ?? c.created_at ?? "");
        if (at !== undefined) ch.publishedAt = at;
        return ch;
      });
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const res = await this.api<{ data?: { chapter?: { pages?: PageDto[] | null } | null } | null }>(
      `/series/${encodeURIComponent(seriesId)}/chapters/${encodeURIComponent(chapterId)}`,
    );
    const pages = res.data?.chapter?.pages ?? [];
    if (pages.length === 0) throw new Error("Asura Scans served no pages for this chapter — it may be premium or early access");
    return pages.map((p, index) => {
      const page: Page = { index, imageUrl: p.url };
      if (p.tiles?.length) {
        page.process = {
          context: { tiles: JSON.stringify(p.tiles), cols: String(p.tile_cols ?? 4), rows: String(p.tile_rows ?? 5) },
        };
      }
      return page;
    });
  }

  /** A tiled page put back: `tiles[i]` is where source tile `i` goes, the inverse of `tileLayout`'s order. */
  async layoutPageImage(req: PageImageLayoutRequest): Promise<PageImageLayout | null> {
    const grid = gridFrom(req.context);
    if (!grid) return null;
    const order = new Array<number>(grid.tiles.length);
    grid.tiles.forEach((dst, src) => (order[dst] = src));
    return tileLayout(req.width, req.height, grid.cols, grid.rows, order);
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  private rememberSeries(slug: string, s: SeriesDto): void {
    if (typeof s.id === "number") this.seriesKeys.set(slug, { id: s.id, ...(s.public_url ? { url: `${SITE}${s.public_url}` } : {}) });
  }

  private rememberChapters(slug: string, chapters: ChapterDto[]): void {
    const keys = new Map<string, number>();
    for (const c of chapters) if (typeof c.id === "number") keys.set(String(c.number), c.id);
    this.chapterKeys.set(slug, keys);
  }

  private async seriesKey(slug: string): Promise<{ id: number; url?: string }> {
    if (!this.seriesKeys.has(slug)) {
      const { series } = await this.api<{ series: SeriesDto }>(`/series/${encodeURIComponent(slug)}`);
      this.rememberSeries(slug, series);
    }
    const key = this.seriesKeys.get(slug);
    if (!key) throw new Error("Asura Scans gave no id for this series' comments");
    return key;
  }

  private async chapterKey(slug: string, number: string): Promise<number> {
    if (!this.chapterKeys.get(slug)?.has(number)) {
      const res = await this.api<{ data?: ChapterDto[] | null }>(`/series/${encodeURIComponent(slug)}/chapters`);
      this.rememberChapters(slug, res.data ?? []);
    }
    const id = this.chapterKeys.get(slug)?.get(number);
    if (id === undefined) throw new Error(`Asura Scans has no chapter ${number} to read comments from`);
    return id;
  }

  /** A comment route, where a 404 is a thread that isn't there (not a series that's gone). */
  private async commentsApi<T>(path: string): Promise<T | undefined> {
    const res = await this.request({
      url: `${API}${path}`,
      headers: { "User-Agent": this.ua, Accept: "application/json", Referer: `${SITE}/`, Origin: SITE },
    });
    if (res.status === 404) return undefined;
    if (res.status >= 400) throw new Error(`Asura Scans answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Asura Scans sent something that isn't JSON for ${path}`);
    }
  }

  override async getComments(req: CommentsRequest): Promise<CommentPage> {
    const { seriesId, chapterId } = req.target;
    const series = await this.seriesKey(seriesId);
    const webUrl = series.url && (chapterId ? `${series.url}/chapter/${chapterId}` : series.url);
    const page = { ...(webUrl ? { webUrl } : {}) };

    if (req.parentId) {
      // Every reply comes back at once, so there is no next page.
      const replies = await this.commentsApi<CommentDto[]>(`/comments/${encodeURIComponent(req.parentId)}/replies`);
      return { ...page, items: (Array.isArray(replies) ? replies : []).map((c) => toComment(c, req.parentId)) };
    }

    const thread = chapterId ? `/chapters/${await this.chapterKey(seriesId, chapterId)}` : `/series/${series.id}`;
    const n = pageFromCursor(req.cursor);
    const q = new URLSearchParams({
      sort: req.sort ?? COMMENT_SORTS[0]!.id,
      offset: String((n - 1) * COMMENTS_PER_PAGE),
      limit: String(COMMENTS_PER_PAGE),
    });
    const res = await this.commentsApi<{ data?: CommentDto[] | null; meta?: { has_more?: boolean; total?: number } | null }>(
      `${thread}/comments?${q}`,
    );
    const items = (res?.data ?? []).map((c) => toComment(c));
    const nextCursor = items.length ? nextPageCursor(n, !!res?.meta?.has_more) : undefined;
    return {
      ...page,
      items,
      ...(nextCursor ? { nextCursor } : {}),
      ...(typeof res?.meta?.total === "number" ? { total: res.meta.total } : {}),
    };
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?asurascans\.com\/(?:comics|series|manga)\/([^/?#]+)(?:\/chapter\/([^/?#]+))?/.exec(url);
    if (!m) return null;
    const seriesId = m[1]!.replace(RANDOM_SUFFIX, "");
    return m[2] ? { seriesId, chapterId: m[2] } : { seriesId };
  }
}

export default defineBridge((host) => new AsuraScansBridge(host));

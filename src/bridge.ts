/**
 * Atsumaru bridge — a real-site bridge for https://atsu.moe, built in the gitignored sandbox.
 *
 * Atsumaru is API-based (JSON), so this uses fetchJson, not cheerio. Field mappings and the
 * three-tier image resolution are ported directly from the Keiyoushi reference (see
 * sandbox/.ref/Atsumaru.kt + Dto.kt). Lists + search + the read path; tri-state genre/tag
 * filters remain a further extension.
 *
 * NOT committed to the repo: bridges targeting specific third-party sites stay out of tree.
 * The backend URL is a user setting.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Filter,
  type HttpRequest,
  type HttpResponse,
  type InferSettings,
  type Page,
  type PagedResults,
  type SearchOptions,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SeriesStatus,
  type SettingDescriptor,
  type SortOption,
  defineBridge,
  defineSettings,
} from "@comical/sdk";

/**
 * Atsumaru is a single fixed public site, so its base URL is a constant — not a user setting
 * (that pattern is for BYO/self-hosted backends like Komga). The only genuine preference is the
 * adult-content toggle (the reference's +18 mode → `&adult=1`).
 */
const BASE_URL = "https://atsu.moe";

const SETTINGS = defineSettings([
  { type: "boolean", key: "adult", label: "Show adult content", default: false },
  // Favorites need an atsu.moe account; browsing works without these.
  { type: "string", key: "username", label: "Username", description: "atsu.moe account (for favorites)", secret: true },
  { type: "string", key: "password", label: "Password", secret: true },
]);
type Settings = InferSettings<typeof SETTINGS>;

// ── Wire DTOs (shapes from sandbox/.ref/Dto.kt) ────────────────────────────────

interface MangaDto {
  id: string;
  title: string;
  poster?: unknown;
  image?: unknown;
  authors?: unknown;
  synopsis?: string;
  genres?: unknown;
  tags?: unknown;
  status?: string;
  type?: string;
  /** Scanlation teams aggregated for this series; Atsumaru labels them Alpha/Beta/Gamma/… */
  scanlators?: Array<{ id: string; name: string }>;
}

interface BrowseMangaDto {
  items: MangaDto[];
}

/** Typesense search response (from /collections/manga/documents/search). */
interface SearchResultsDto {
  page: number;
  found: number;
  hits: Array<{ document: MangaDto }>;
  request_params: { per_page: number };
}

interface MangaObjectDto {
  mangaPage: MangaDto;
}

interface ChapterDto {
  id: string;
  number: number;
  title: string;
  createdAt?: number | string;
  /** Which scanlation team produced this chapter (maps to MangaDto.scanlators[].id). */
  scanlationMangaId?: string;
  pageCount?: number;
}

interface AllChaptersDto {
  chapters: ChapterDto[];
}

interface PageObjectDto {
  readChapter: { pages: Array<{ image: string }> };
}

const PROTOCOL_REGEX = /^https?:?\/\//;
const PER_PAGE = 40;
const TYPES = "Manga,Manwha,Manhua,OEL";
// A realistic desktop browser UA — Atsumaru/Cloudflare reject the default runtime UA.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Genre name → Typesense genreId, and sort fields — from sandbox/.ref/Filters.kt.
const GENRES: ReadonlyArray<{ id: string; name: string }> = [
  { id: "39", name: "Action" }, { id: "37", name: "Adventure" }, { id: "6", name: "Comedy" },
  { id: "31", name: "Drama" }, { id: "36", name: "Fantasy" }, { id: "44", name: "Horror" },
  { id: "29", name: "Martial Arts" }, { id: "32", name: "Mystery" }, { id: "18", name: "Psychological" },
  { id: "9", name: "Romance" }, { id: "1", name: "Sci-Fi" }, { id: "7", name: "Slice of Life" },
  { id: "22", name: "Supernatural" }, { id: "19", name: "Thriller" }, { id: "5", name: "Tragedy" },
];
const STATUSES = ["Ongoing", "Completed", "Hiatus", "Canceled"];
// Sort fields verified sortable against the live Typesense schema (the reference's `avgRating`
// and `title` 404 — it's `mbRating`, and `title` isn't a sort field).
const SORTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "views", label: "Popularity" }, { value: "trending", label: "Trending" },
  { value: "dateAdded", label: "Date Added" }, { value: "released", label: "Release Date" },
  { value: "mbRating", label: "Top Rated" }, { value: "chapterCount", label: "Chapter Count" },
];

const STATUS_MAP: Record<string, SeriesStatus> = {
  ongoing: "ongoing",
  completed: "completed",
  hiatus: "hiatus",
  canceled: "cancelled",
  cancelled: "cancelled",
};

class AtsumaruBridge extends BridgeBase<Settings> {
  readonly info: BridgeInfo = {
    id: "atsumaru",
    name: "Atsumaru",
    version: "0.1.0",
    contractVersion: "1.0.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "settings", "favorites"],
    // atsu.moe tolerates ~2 req/s; serialize and space requests to stay polite. Every host
    // (server, web, native) inherits this — no per-host configuration needed.
    rateLimit: { maxConcurrent: 1, minIntervalMs: 550 },
  };

  getSettings(): SettingDescriptor[] {
    return [...SETTINGS];
  }

  private base(): string {
    return BASE_URL;
  }

  private adultParam(): string {
    return this.setting("adult") === true ? "&adult=1" : "";
  }

  /** Browser-like headers; mirrors the reference's apiHeaders (Accept, Referer) + a real UA. */
  private apiHeaders(): Record<string, string> {
    return {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
      Referer: `${this.base()}/`,
    };
  }

  private getJson<T>(url: string): Promise<T> {
    return this.fetchJson<T>(url, this.apiHeaders());
  }

  /** Three-tier image resolution, ported from Dto.kt getImagePath + toSManga. */
  private resolveImage(raw: unknown): string | undefined {
    let path: string | undefined;
    if (typeof raw === "string") path = raw;
    else if (raw && typeof raw === "object" && typeof (raw as { image?: unknown }).image === "string") {
      path = (raw as { image: string }).image;
    }
    if (!path) return undefined;

    const cleaned = path.replace(/^\//, "").replace(/^static\//, "");
    let url: string;
    if (/^https?/.test(cleaned)) url = cleaned;
    else if (cleaned.startsWith("//")) url = `https:${cleaned}`;
    else url = `${this.base()}/static/${cleaned}`;
    return url.replace(PROTOCOL_REGEX, "https://");
  }

  /** Flatten authors/genres which may be string[] or {name}[]. */
  private static names(element: unknown): string[] {
    if (!Array.isArray(element)) return [];
    return element
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string") {
          return (item as { name: string }).name;
        }
        return undefined;
      })
      .filter((s): s is string => !!s);
  }

  /** Split authors into author/artist names by `type`, deduped (ports Dto.kt toSManga). */
  private static credits(element: unknown): { authors: string[]; artists: string[] } {
    const authors = new Set<string>();
    const artists = new Set<string>();
    if (Array.isArray(element)) {
      for (const item of element) {
        if (typeof item === "string") {
          authors.add(item);
        } else if (item && typeof item === "object") {
          const name = (item as { name?: unknown }).name;
          const type = (item as { type?: unknown }).type;
          if (typeof name !== "string") continue;
          if (type === "Artist") artists.add(name);
          else authors.add(name); // "Author" or untyped
        }
      }
    }
    return { authors: [...authors], artists: [...artists] };
  }

  private toEntry(dto: MangaDto): SeriesEntry {
    const entry: SeriesEntry = { id: dto.id, title: dto.title };
    const thumb = this.resolveImage(dto.poster ?? dto.image);
    if (thumb) entry.thumbnailUrl = thumb;
    return entry;
  }

  // ── Required + capability methods ────────────────────────────────────────────

  /** Atsumaru's browsable lists. Each maps to an `/api/infinite/{endpoint}` route. */
  private static readonly LISTS: ReadonlyArray<SeriesList & { endpoint: string }> = [
    { id: "trending", name: "Trending", layout: "carousel", featured: true, endpoint: "trending" },
    { id: "recentlyUpdated", name: "Recently Updated", layout: "grid", featured: true, endpoint: "recentlyUpdated" },
  ];

  async getLists(): Promise<SeriesList[]> {
    return AtsumaruBridge.LISTS.map(({ endpoint, ...list }) => {
      void endpoint;
      return list;
    });
  }

  async getListItems(listId: string, page: number): Promise<PagedResults<SeriesEntry>> {
    const list = AtsumaruBridge.LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    const url = `${this.base()}/api/infinite/${list.endpoint}?page=${page - 1}&types=${TYPES}${this.adultParam()}`;
    const data = await this.getJson<BrowseMangaDto>(url);
    const items = (data.items ?? []).map((d) => this.toEntry(d));
    return { items, page, hasNextPage: items.length >= PER_PAGE };
  }

  /**
   * Text search via Atsumaru's Typesense endpoint (proxied keyless on atsu.moe). Ported from the
   * reference's searchMangaRequest/searchMangaParse. Page is 1-based here (unlike the 0-indexed
   * infinite-scroll list endpoints). Tri-state genre/tag filters are a further extension.
   */
  getFilters(): Promise<Filter[]> {
    return Promise.resolve([
      { type: "multiselect", key: "genre", label: "Genres", options: GENRES.map((g) => ({ value: g.id, label: g.name })) },
      { type: "multiselect", key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })) },
      { type: "number", key: "year", label: "Release year", min: 1900, max: 2100 },
      { type: "number", key: "minChapters", label: "Minimum chapters", min: 0 },
    ]);
  }

  getSortOptions(): Promise<SortOption[]> {
    return Promise.resolve(SORTS.map((s) => ({ key: s.value, label: s.label })));
  }

  async getSearchResults(
    query: string,
    page: number,
    options?: SearchOptions,
  ): Promise<PagedResults<SeriesEntry>> {
    // Single-quoted so the backtick field-quoting from Typesense's syntax stays literal.
    const clauses = [
      "hidden:!=true",
      ...(this.setting("adult") === true ? [] : ["isAdult:=false"]),
      "(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)",
      "views:>0",
    ];

    for (const f of options?.filters ?? []) {
      const arr = Array.isArray(f.value) ? f.value : [];
      if (f.key === "genre" && arr.length) clauses.push(arr.map((id) => `genreIds:=\`${id}\``).join(" && "));
      else if (f.key === "status" && arr.length) clauses.push(`status:=[${arr.map((s) => `\`${s}\``).join(",")}]`);
      else if (f.key === "year" && typeof f.value === "number") clauses.push(`releaseYear:=[${f.value}]`);
      else if (f.key === "minChapters" && typeof f.value === "number") clauses.push(`chapterCount:>=${f.value}`);
    }

    // Sort is its own concern → Typesense sort_by (mirrors the backend's filter_by/sort_by split).
    const sortBy = options?.sort ? `${options.sort.key}:${options.sort.ascending ? "asc" : "desc"}` : undefined;

    const params = new URLSearchParams({
      q: query.trim() || "*",
      filter_by: clauses.join(" && "),
      page: String(page),
      per_page: String(PER_PAGE),
    });
    if (sortBy) params.set("sort_by", sortBy);
    if (query.trim()) {
      params.set("query_by", "title,englishTitle,otherNames,authors");
      params.set("query_by_weights", "4,3,2,1");
      params.set("num_typos", "4,3,2,1");
    }

    const url = `${this.base()}/collections/manga/documents/search?${params.toString()}`;
    const body = await this.fetchText(url, this.apiHeaders());

    // Typesense returns { hits: [{ document }], found, page, request_params } — fall back to the
    // browse shape if the proxy ever answers with { items } instead (matches the reference).
    if (body.includes('"hits"')) {
      const data = JSON.parse(body) as SearchResultsDto;
      const items = (data.hits ?? []).map((h) => this.toEntry(h.document));
      const perPage = data.request_params?.per_page || PER_PAGE;
      return { items, page, hasNextPage: data.page * perPage < data.found };
    }
    const data = JSON.parse(body) as BrowseMangaDto;
    const items = (data.items ?? []).map((d) => this.toEntry(d));
    return { items, page, hasNextPage: items.length >= PER_PAGE };
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const url = `${this.base()}/api/manga/page?id=${encodeURIComponent(seriesId)}`;
    const dto = (await this.getJson<MangaObjectDto>(url)).mangaPage;

    const info: SeriesInfo = { id: seriesId, title: dto.title };
    const thumb = this.resolveImage(dto.poster ?? dto.image);
    if (thumb) info.thumbnailUrl = thumb;
    if (dto.synopsis?.trim()) info.description = dto.synopsis.trim();

    const { authors, artists } = AtsumaruBridge.credits(dto.authors);
    if (authors.length > 0) info.author = authors.join(", ");
    if (artists.length > 0) info.artist = artists.join(", ");

    const genres = [
      ...(dto.type ? [dto.type] : []),
      ...AtsumaruBridge.names(dto.genres),
    ];
    if (genres.length > 0) info.genres = genres;

    // Atsumaru exposes `tags` separately from `genres` — surface them as a labeled tag group.
    const tagNames = AtsumaruBridge.names(dto.tags);
    if (tagNames.length > 0) info.tagGroups = [{ label: "Tags", kind: "theme", tags: tagNames }];

    info.status = STATUS_MAP[dto.status?.toLowerCase().trim() ?? ""] ?? "unknown";
    return info;
  }

  async getChapters(seriesId: string): Promise<Chapter[]> {
    const url = `${this.base()}/api/manga/allChapters?mangaId=${encodeURIComponent(seriesId)}`;
    const raw = (await this.getJson<AllChaptersDto>(url)).chapters ?? [];

    // Atsumaru aggregates multiple scanlation teams; `allChapters` returns every team's chapters, so
    // a chapter number can appear once per team. Keep them all and label each with its team name
    // (Alpha/Gamma/…). Only multi-team series pay the extra lookup for the id→name map.
    const teamIds = new Set(raw.map((c) => c.scanlationMangaId).filter((s): s is string => !!s));
    const multiTeam = teamIds.size > 1;
    const teamName = multiTeam ? await this.scanlatorNames(seriesId) : new Map<string, string>();

    return raw
      .map((c) => {
        const base = c.title?.trim() || `Chapter ${c.number}`;
        const team = c.scanlationMangaId ? teamName.get(c.scanlationMangaId) : undefined;
        const chapter: Chapter = {
          id: c.id,
          name: multiTeam && team ? `${base} — ${team}` : base,
        };
        if (Number.isFinite(c.number)) chapter.number = c.number;
        if (team) chapter.group = team;
        if (Number.isFinite(c.pageCount)) chapter.pageCount = c.pageCount;
        const published = parseDate(c.createdAt);
        if (published !== undefined) chapter.publishedAt = published;
        return chapter;
      })
      .filter((c) => c.id.length > 0)
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0)); // ascending; conformance wants consistency
  }

  /** Map scanlationMangaId → team name (Alpha/Beta/…) from the manga page's `scanlators` list. */
  private async scanlatorNames(seriesId: string): Promise<Map<string, string>> {
    const url = `${this.base()}/api/manga/page?id=${encodeURIComponent(seriesId)}`;
    const page = (await this.getJson<MangaObjectDto>(url)).mangaPage;
    const map = new Map<string, string>();
    for (const s of page.scanlators ?? []) if (s?.id && s?.name) map.set(s.id, s.name);
    return map;
  }

  async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const url =
      `${this.base()}/api/read/chapter?mangaId=${encodeURIComponent(seriesId)}` +
      `&chapterId=${encodeURIComponent(chapterId)}`;
    const data = await this.getJson<PageObjectDto>(url);
    const referer = `${this.base()}/`;

    return (data.readChapter?.pages ?? [])
      .map((p, index): Page | undefined => {
        const imageUrl = this.resolveImage(p.image);
        return imageUrl ? { index, imageUrl, headers: { Referer: referer } } : undefined;
      })
      .filter((p): p is Page => p !== undefined);
  }

  // ── Favorites (capability "favorites") — atsu.moe "bookmarks", account-bound ──────────────────
  // Auth is cookie-based: POST /api/auth/login establishes a session; core's gated network holds the
  // cookie. Calls retry once after a fresh login on 401 (lazy login). Credentials are secret settings.

  async getFavorites(page: number): Promise<PagedResults<SeriesEntry>> {
    // Omit the params when false — atsu.moe 400s on empty values (it doesn't accept `adult=`).
    const qs = this.setting("adult") === true ? "?adult=1&includeAdult=1" : "";
    const url = `${this.base()}/api/user/bookmarksPage${qs}`;
    const res = await this.authed({ url, headers: this.apiHeaders() });
    const data = JSON.parse(res.body) as { bookmarks?: BookmarkDto[] };
    const items = (data.bookmarks ?? []).map((b) => this.bookmarkToEntry(b));
    return { items, page, hasNextPage: false };
  }

  async addFavorite(seriesId: string): Promise<void> {
    await this.syncBookmark(seriesId, "PlanToRead");
  }

  async removeFavorite(seriesId: string): Promise<void> {
    await this.syncBookmark(seriesId, null);
  }

  /** POST a single bookmark delta; `status: null` removes it. */
  private async syncBookmark(mangaId: string, status: string | null): Promise<void> {
    const res = await this.authed({
      url: `${this.base()}/api/user/syncBookmarks`,
      method: "POST",
      headers: { ...this.apiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify([{ mangaId, status }]),
    });
    if (res.status >= 400) throw new Error(`syncBookmarks failed: ${res.status} ${res.statusText}`);
  }

  /** Run a request; on 401, log in once (session lands in the core cookie jar) and retry. */
  private async authed(req: HttpRequest): Promise<HttpResponse> {
    let res = await this.request(req);
    if (res.status === 401) {
      await this.login();
      res = await this.request(req);
    }
    if (res.status >= 400) throw new Error(`${req.url} → ${res.status} ${res.statusText}`);
    return res;
  }

  private async login(): Promise<void> {
    const username = this.setting("username");
    const password = this.setting("password");
    if (!username || !password) {
      throw new Error("favorites require a username + password (set them in this bridge's settings)");
    }
    const res = await this.request({
      url: `${this.base()}/api/auth/login`,
      method: "POST",
      headers: { ...this.apiHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }).toString(),
    });
    let parsed: { status?: string; error?: string } = {};
    try { parsed = JSON.parse(res.body) as typeof parsed; } catch { /* non-JSON error body */ }
    if (res.status >= 400 || parsed.status !== "success") {
      throw new Error(`atsu.moe login failed: ${parsed.error ?? res.statusText}`);
    }
  }

  private bookmarkToEntry(b: BookmarkDto): SeriesEntry {
    const id = b.id ?? b.mangaId ?? "";
    const entry: SeriesEntry = { id, title: b.title ?? b.englishTitle ?? id };
    const thumb = this.resolveImage(b.poster ?? b.image);
    if (thumb) entry.thumbnailUrl = thumb;
    return entry;
  }
}

/** A bookmark entry from /api/user/bookmarksPage (fields are defensive — verify against a real account). */
interface BookmarkDto {
  id?: string;
  mangaId?: string;
  title?: string;
  englishTitle?: string;
  poster?: unknown;
  image?: unknown;
  bookmarkStatus?: string;
}

/** Parse a chapter date that may be epoch ms (number) or an ISO-8601 string. */
function parseDate(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return undefined;
}

export default defineBridge((host) => new AtsumaruBridge(host));

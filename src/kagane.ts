/**
 * Kagane bridge — https://kagane.moe, a JSON API (`/api/v2`) over official releases and scanlations.
 *  - lists + search: `POST /api/v2/search/series?page={n-1}&size=35[&sort={key},{dir}]` with a JSON
 *    body (title, source types, language, content rating, genres, format, status, year)
 *  - details: `GET /api/v2/series/{id}`; chapters: `GET /api/v2/series/{id}/books/index?fields=List`,
 *    a columnar index (`fields` names the columns of each `books` row, `group_ix` points into `groups`)
 *  - pages: `POST /api/integrity` (a short-lived token, kept until its `exp`), then
 *    `POST /api/v2/books/{book}?intent=Read` with `x-integrity-token`, which answers with a per-book
 *    access token, the image host (`cache_url`) and the page manifest
 *  - covers: `GET /api/v2/image/{image id}`
 *
 * Series ids are the site's series UUIDs, chapter ids its book UUIDs.
 *
 * This is the safe-for-work build: searches ask only for Safe (or, by setting, 15+) series, never
 * pornographic or disturbing ones, anything rated 18+ that slips through is dropped, and an 18+
 * series opened by link is refused. Each item carries its rating (Safe → everyone, 15+ → mature).
 *
 * Page images live on `kstatic.to`, which wants the site's Origin and Referer and the book's access
 * token in the query. `original` is JPEG XL (which Android can't decode), so pages default to the
 * `datasaver` WebP; a setting picks the original. Access tokens expire after a while, so page URLs
 * are intercepted at fetch time and a stale token is swapped for a fresh one.
 *
 * The site sits behind Cloudflare, whose clearance is tied to the User-Agent: requests use the host's
 * browser User-Agent when it has one, so a web check passed in the app keeps working.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Filter,
  type FilterValue,
  type HttpRequest,
  type HttpResponse,
  type ImageRequest,
  type InferSettings,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PagedResults,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SettingDescriptor,
  type SortOption,
  type TagGroup,
  defineBridge,
  defineSettings,
  nextPageCursor,
  pageFromCursor,
  parseFilterIncludeExclude,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";

const SITE = "https://kagane.moe";
const API = `${SITE}/api/v2`;
const LINK_HOSTS = ["kagane.moe", "kagane.cx", "kagane.net"];
const IMAGE_HOSTS = ["kstatic.to", "kagane.moe"];
const PAGE_HOST = "kstatic.to";
const PAGE_SIZE = 35;
const FALLBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** What the image host insists on. */
const IMAGE_HEADERS = { Origin: SITE, Referer: `${SITE}/` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A token this close to expiring is treated as expired. */
const TOKEN_MARGIN_MS = 60_000;
/** When an access token's own expiry can't be read, how long to trust it. */
const TOKEN_FALLBACK_MS = 5 * 60_000;
const MAX_CACHED_BOOKS = 16;

const SETTINGS = defineSettings([
  {
    type: "enum",
    key: "rating",
    label: "Content rating",
    description: "The highest rating to show. 18+ series are never shown.",
    options: [
      { value: "safe", label: "Safe" },
      { value: "fifteenplus", label: "Safe and 15+" },
    ],
    default: "safe",
  },
  {
    type: "enum",
    key: "quality",
    label: "Page quality",
    description: "Original pages are JPEG XL, which not every device can show.",
    options: [
      { value: "datasaver", label: "Data saver (WebP)" },
      { value: "original", label: "Original (JPEG XL)" },
    ],
    default: "datasaver",
  },
]);
type Settings = InferSettings<typeof SETTINGS>;

/** The search API's sort keys (`sort={key},{asc|desc}`); "relevance" sends none. */
const SORTS: ReadonlyArray<SortOption> = [
  { key: "relevance", label: "Relevance", directionless: true },
  { key: "total_views", label: "Popular (total views)" },
  { key: "avg_views", label: "Popular (average views)" },
  { key: "avg_views_today", label: "Popular today" },
  { key: "avg_views_week", label: "Popular this week" },
  { key: "avg_views_month", label: "Popular this month" },
  { key: "updated_at", label: "Latest" },
  { key: "current_books", label: "Chapter count" },
  { key: "created_at", label: "Date added" },
];

/** The site's genre list (`/api/v2/genres/list`, Nov 2026), less the adult-only ones. */
const GENRES: ReadonlyArray<[string, string]> = [
  ["4-koma", "019bef86-56a6-71a1-af75-c1e43f48fba4"], ["Action", "019c1fe4-fabf-7242-a0a8-7866f98f705e"],
  ["Adventure", "019c1b6f-b682-7fee-9a9b-86e648b77e9e"], ["AI", "019c3a02-5288-777a-b5d8-1bf9f79163ae"],
  ["Award Winning", "019c1fea-1b14-72d5-b2f8-c3194c4e1efe"], ["Comedy", "019c1fe5-51fe-7f26-aee3-f057ac50f81d"],
  ["Coming of Age", "019c3a02-b00d-731d-884c-41460acc81e4"], ["Cooking", "019c2043-f726-7f78-9c58-7caf4662bf1f"],
  ["Crime", "019c2043-d238-744b-8d5a-21bbc5166bd7"], ["Demons", "019c1fe8-cad1-7842-82a7-db5a87fc0a5a"],
  ["Doujinshi", "019c1fea-2ddc-7e74-9935-a8b1b7782dd2"], ["Drama", "019c1b6f-3d3b-7528-a3e2-a791cfdcc4f7"],
  ["Ecchi", "019c200d-6238-7364-9422-c50bd75e4e0d"], ["Fan Colored", "019c1fe9-da2f-7938-a795-2b862b221cb3"],
  ["Fantasy", "019c1b6f-51ed-7991-a796-a8ca26e86666"], ["Full Color", "019c1fe9-9527-7f47-bf28-36ab2d6d4acd"],
  ["Gender Bender", "019c1fe7-5189-7619-9094-6e4b85c139ec"], ["Gore", "019c1fe6-6717-77fa-8205-85d8e8a8755c"],
  ["Harem", "019c1fe8-74eb-73e6-840e-7916f145012e"], ["Historical", "019c1fe6-7ea3-7741-9191-5ba94f6e9552"],
  ["Horror", "019c1b6f-c2e3-7909-93cf-0a48a2f2278f"], ["Isekai", "019c1fe6-3ba5-7e76-aa0d-8756c314e2fa"],
  ["Josei", "019c1b70-101d-7c9c-a28c-cc2439104443"], ["LGBTQIA+", "019c1feb-8388-7c89-8c2d-ddfb530065e6"],
  ["Magic", "019c1fe8-2221-7d69-9cd2-b67d64924994"], ["Magical Girls", "019c1fe7-13fa-7019-a5a6-e7bbceb200f2"],
  ["Martial Arts", "019c1fe8-4c93-7f12-a6f0-e805fe4ade21"], ["Mecha", "019c2044-1fd9-7e84-b9c9-cbf20945a664"],
  ["Medical", "019c1fe7-2c1e-730c-af33-ca3bef3a161d"], ["Military", "019c1fe8-e822-7938-a04c-dee0a24f022c"],
  ["Monsters", "019c1fe8-3261-7c3d-9103-428f9a54eb41"], ["Music", "019c200f-1825-738c-b7c1-67266b9520b1"],
  ["Mystery", "019c1b6f-7991-7edb-8c7f-df6876f09a94"], ["Office Workers", "019c1fe8-a048-7453-a06d-212678bf777a"],
  ["Official Colored", "019c1fe9-f0a1-71c6-bbe0-6afc3822647a"], ["Omegaverse", "019c22cd-bb85-7541-9db6-7e6ea3394d0b"],
  ["Oneshot", "019c1fe9-ae8d-7294-bcc8-9bd4269b94d7"], ["Philosophical", "019c1fe7-380c-72a5-8668-930c5e90ec44"],
  ["Police", "019c1fe9-4fe3-776a-b11c-a14d76a52e7d"], ["Post-Apocalyptic", "019c1fe9-0e7c-7782-8265-c29ee6c19e79"],
  ["Psychological", "019c1ee5-dfa9-7b69-86a8-16831c1d81fe"], ["Reincarnation", "019c1fe8-5a6d-73bd-835d-16ae059bce6e"],
  ["Reverse Harem", "019c1fe8-8837-78de-a911-f54754c2e713"], ["Romance", "019beb9a-a36a-718c-b551-d917a0818cc7"],
  ["School Life", "019c1fe7-db44-77a1-acc2-28c2bbb49ae1"], ["Sci-Fi", "019c1fe5-b704-72a6-a676-a8ad87ebcdd8"],
  ["Seinen", "019c1fea-983f-7279-944e-8fb6e2cccdbc"], ["Shoujo", "019c1b6f-fe1c-7eed-b93b-e1bf6dff63fd"],
  ["Shoujo Ai", "019c1ee5-626f-7284-b5e8-8f3df5c5f76b"], ["Shounen", "019c1fea-85c7-76a7-996a-b41ce0cb05f8"],
  ["Shounen Ai", "019c1ee5-4be9-766d-b545-5b87d7cdff96"], ["Slice of Life", "019c1fe5-84d9-7a67-9240-1f303dc231bc"],
  ["Sports", "019c1fe6-bc40-7aa4-bac6-29a6cc29b559"], ["Supernatural", "019c1b6f-9c7b-77a0-8b54-e62925422b91"],
  ["Survival", "019c1fe8-b2ab-7e15-a55b-9fb28901cc9d"], ["Thriller", "019c1fe6-0228-7052-98a2-fe6df7994d93"],
  ["Time Travel", "019c1fe8-f932-7a19-a502-4ad6a2adfae4"], ["Tragedy", "019c1fe6-211d-7e73-927d-3c54b66a9055"],
  ["Vampires", "019c1fe9-78cc-7d2e-be56-cc3f8442ccf0"], ["Video Games", "019c1fe9-21a7-7bbd-9763-10a5855a8e5c"],
  ["Villainess", "019c1fe9-3609-73d2-b4bf-8420cc15c5b2"], ["Wuxia", "019c1fe7-0344-755b-b4df-c019f4cdbc21"],
  ["Yaoi", "019c1ee5-38f9-7324-9f7d-07a01dbf88a6"], ["Yuri", "019c1ee5-7e79-7fd2-8fcc-de739858c851"],
];
const FORMATS = ["Manga", "Manhwa", "Manhua", "Comic", "Other"];
const STATUSES: ReadonlyArray<[string, string]> = [["Ongoing", "Ongoing"], ["Completed", "Completed"], ["Hiatus", "Hiatus"], ["Cancelled", "Abandoned"]];
const AUTHOR_ROLES = new Set(["author", "story", "original creator"]);
const ARTIST_ROLES = new Set(["artist", "art"]);

// ── Wire shapes ───────────────────────────────────────────────────────────────

interface RatedDto {
  age_rating?: string | null;
  is_pornographic?: boolean | null;
}

interface SearchItemDto extends RatedDto {
  series_id: string;
  title: string;
  cover_image_id?: string | null;
  format?: string | null;
  current_books?: number | null;
  latest_chapters?: { title?: string | null; chapter_no?: string | null }[];
}

interface SearchDto {
  content?: SearchItemDto[];
  last?: boolean;
}

interface SeriesDto extends RatedDto {
  series_id?: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  upload_status?: string | null;
  publication_status?: string | null;
  format?: string | null;
  original_language?: string | null;
  translated_language?: string | null;
  start_year?: number | null;
  end_year?: number | null;
  total_views?: number | null;
  series_staff?: { staff_id: string; name: string; role: string; priority?: number }[];
  genres?: { genre_id?: string; genre_name: string; is_spoiler?: boolean }[];
  tags?: { tag_id?: string; tag_name: string; is_spoiler?: boolean }[];
  series_alternate_titles?: { title: string }[];
  series_covers?: { image_id: string; is_main?: boolean }[];
  series_links?: { url: string; label?: string | null; kind?: string | null }[];
}

interface IndexDto {
  count?: number;
  fields: string[];
  groups?: { title: string }[];
  books: unknown[][];
}

interface ChallengeDto {
  access_token: string;
  cache_url: string;
  manifest?: { pages?: { page_no: number; page_id: string; ext?: string | null }[] };
}

/** A book's access token and what came with it, kept until the token is about to expire. */
interface BookAccess {
  challenge: ChallengeDto;
  expiresAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A JWT's `exp` as epoch ms, or undefined when it can't be read. */
function jwtExpiry(token: string): number | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Kagane's rating as Comical's tier; anything 18+ or pornographic is "adult". */
function ratingOf(dto: RatedDto): "everyone" | "mature" | "adult" {
  if (dto.is_pornographic || dto.age_rating === "EighteenPlus") return "adult";
  return dto.age_rating === "Safe" ? "everyone" : "mature";
}

function coverUrl(imageId: string | null | undefined): string | undefined {
  return imageId ? `${API}/image/${encodeURIComponent(imageId)}` : undefined;
}

function hostCovered(url: string, hosts: readonly string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** A number from a string like "12" or "12.5", else undefined. */
function num(s: unknown): number | undefined {
  if (typeof s === "number") return Number.isFinite(s) ? s : undefined;
  if (typeof s !== "string" || !/^\s*\d+(?:\.\d+)?\s*$/.test(s)) return undefined;
  return Number(s);
}

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n);

/** The site's series id from a `/series/{slug}-{uuid}[/reader/{book}]` link, with the book when named. */
function linkTarget(url: string): LinkTarget | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!LINK_HOSTS.includes(host)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "series" || !parts[1]) return null;
  const seriesId = parts[1].slice(-36);
  if (!UUID.test(seriesId)) return null;
  const book = parts[2] === "reader" ? parts[3] : undefined;
  return book && UUID.test(book) ? { seriesId, chapterId: book } : { seriesId };
}

class KaganeBridge extends BridgeBase<Settings> {
  readonly info: BridgeInfo = {
    id: "pos5drow.kagane",
    name: "Kagane",
    version: "0.1.0",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 350 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: [...LINK_HOSTS],
    images: { hosts: [...IMAGE_HOSTS], headers: { ...IMAGE_HEADERS }, intercept: [PAGE_HOST] },
  };

  private readonly guards = standardGuards([...LINK_HOSTS, PAGE_HOST]);
  private integrity: { token: string; expiresAt: number } | undefined;
  private readonly books = new Map<string, BookAccess>();
  private readonly pending = new Map<string, Promise<BookAccess>>();

  private get ua(): string {
    const h = this.userAgent;
    return h && h.startsWith("Mozilla/5.0") ? h : FALLBACK_UA;
  }

  getSettings(): SettingDescriptor[] {
    return [...SETTINGS];
  }

  protected override async request(req: HttpRequest): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "User-Agent": this.ua, Accept: "application/json", Referer: `${SITE}/`, ...extra };
  }

  /** A JSON API call. `what` names the thing asked for in errors; a 404 means it is gone. */
  private async api<T>(url: string, what: string, init: { body?: string; headers?: Record<string, string>; gone?: string } = {}): Promise<T> {
    const post = init.body !== undefined;
    const res = await this.request({
      url,
      method: post ? "POST" : "GET",
      headers: this.headers({ ...(post ? { Origin: SITE } : {}), ...init.headers }),
      ...(post ? { body: init.body } : {}),
    });
    if (res.status === 404) throw new Error(seriesGoneMessage(init.gone));
    if (res.status >= 400) throw new Error(`Kagane answered HTTP ${res.status} for ${what}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Kagane sent something that isn't JSON for ${what}`);
    }
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [
      { id: "popular", name: "Popular", layout: "grid", featured: true },
      { id: "latest", name: "Latest updates", layout: "grid", featured: true },
      { id: "week", name: "Popular this week", layout: "grid" },
    ];
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const sort = { popular: "total_views", latest: "updated_at", week: "avg_views_week" }[listId];
    if (!sort) throw new Error(`unknown list: ${listId}`);
    return this.search(pageFromCursor(req.cursor), "", [], { key: sort, ascending: false });
  }

  async getFilters(): Promise<Filter[]> {
    return [
      { type: "multiselect", key: "genre", label: "Genres", excludable: true, options: GENRES.map(([label, value]) => ({ value, label })) },
      { type: "toggle", key: "anyGenre", label: "Match any selected genre (instead of all)" },
      { type: "multiselect", key: "format", label: "Format", options: FORMATS.map((f) => ({ value: f, label: f })) },
      { type: "multiselect", key: "status", label: "Status", options: STATUSES.map(([label, value]) => ({ value, label })) },
      { type: "number", key: "from", label: "From year", min: 1900 },
      { type: "number", key: "to", label: "To year", min: 1900 },
      { type: "toggle", key: "official", label: "Official releases only" },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    return this.search(pageFromCursor(req.cursor), req.text.trim(), req.filters ?? [], req.sort);
  }

  private async search(page: number, text: string, filters: readonly FilterValue[], sort?: { key: string; ascending?: boolean }) {
    const params = new URLSearchParams({ page: String(page - 1), size: String(PAGE_SIZE) });
    if (sort && sort.key !== "relevance" && SORTS.some((s) => s.key === sort.key)) {
      params.set("sort", `${sort.key},${sort.ascending ? "asc" : "desc"}`);
    }
    const body = this.searchBody(text, filters);
    const dto = await this.api<SearchDto>(`${API}/search/series?${params}`, "a search", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const content = dto.content ?? [];
    const items = content.filter((c) => ratingOf(c) !== "adult" && c.series_id && c.title?.trim()).map((c) => this.entry(c));
    return { items, nextCursor: nextPageCursor(page, dto.last === false && content.length > 0) };
  }

  /** The search body: the reference client's fields, with the content rating pinned to safe-for-work. */
  private searchBody(text: string, filters: readonly FilterValue[]): Record<string, unknown> {
    const get = (key: string) => filters.find((f) => f.key === key)?.value;
    const list = (key: string, allowed: readonly string[]) => {
      const v = get(key);
      return Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : [];
    };
    const year = (key: string) => {
      const v = Number(get(key));
      return Number.isInteger(v) && v >= 1900 && v <= 2100 ? v : undefined;
    };
    const body: Record<string, unknown> = {};
    if (text) body["title"] = text;
    body["source_type"] = get("official") === true ? ["Official"] : ["Official", "Unofficial", "Mixed"];
    body["age_rating"] = this.settings.rating === "fifteenplus" ? ["Safe", "FifteenPlus"] : ["Safe"];
    body["is_pornographic"] = false;
    body["is_disturbing"] = false;
    const genreIds = GENRES.map(([, id]) => id);
    const genres = parseFilterIncludeExclude(get("genre"));
    const include = genres.include.filter((g) => genreIds.includes(g));
    const exclude = genres.exclude.filter((g) => genreIds.includes(g));
    if (include.length || exclude.length) {
      body["genres"] = {
        ...(get("anyGenre") === true ? {} : { match_all: true }),
        values: include,
        ...(exclude.length ? { exclude } : {}),
      };
    }
    const formats = list("format", FORMATS);
    if (formats.length) body["format"] = formats;
    const statuses = list("status", STATUSES.map(([, v]) => v));
    if (statuses.length) body["upload_status"] = statuses;
    const from = year("from");
    const to = year("to");
    if (from !== undefined || to !== undefined) body["start_year"] = { ...(from !== undefined ? { min: from } : {}), ...(to !== undefined ? { max: to } : {}) };
    body["content_lang"] = ["en"];
    return body;
  }

  private entry(c: SearchItemDto): SeriesEntry {
    const e: SeriesEntry = { id: c.series_id, title: c.title.trim(), contentRating: ratingOf(c) };
    const cover = coverUrl(c.cover_image_id);
    if (cover) e.thumbnailUrl = cover;
    const latest = c.latest_chapters?.[0];
    const sub = [c.format?.trim(), latest?.chapter_no ? `Ch. ${latest.chapter_no}` : undefined].filter(Boolean).join(" · ");
    if (sub) e.subtitle = sub;
    return e;
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private checkId(id: string, what = "removed from the source"): void {
    if (!UUID.test(id)) throw new Error(seriesGoneMessage(what));
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    this.checkId(seriesId);
    const d = await this.api<SeriesDto>(`${API}/series/${seriesId}`, "this series");
    if (!d.title?.trim()) throw new Error("Kagane changed its series API (no title found); this bridge needs an update");
    const rating = ratingOf(d);
    if (rating === "adult") throw new Error("Kagane rates this series 18+, and this bridge only shows safe-for-work series");
    const title = d.title.trim();
    const info: SeriesInfo = {
      id: seriesId,
      title,
      contentRating: rating,
      shareUrl: `${SITE}/series/${d.slug ? `${d.slug}-` : ""}${seriesId}`,
      languages: ["en"],
    };
    const alt = [...new Set((d.series_alternate_titles ?? []).map((a) => a.title?.trim()).filter((t): t is string => !!t && t !== title))];
    if (alt.length) info.altTitles = alt;
    const covers = d.series_covers ?? [];
    const cover = coverUrl((covers.find((c) => c.is_main) ?? covers[0])?.image_id);
    if (cover) info.thumbnailUrl = cover;

    const staff = [...(d.series_staff ?? [])].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const credits = (roles: Set<string>) => {
      const seen = new Set<string>();
      return staff
        .filter((s) => roles.has(s.role.trim().toLowerCase()) && s.name?.trim() && !seen.has(s.staff_id) && seen.add(s.staff_id))
        .map((s) => ({ name: s.name.trim(), id: s.staff_id }));
    };
    const authors = credits(AUTHOR_ROLES);
    const artists = credits(ARTIST_ROLES);
    if (authors.length) {
      info.authors = authors;
      info.author = authors.map((a) => a.name).join(", ");
    }
    if (artists.length) {
      info.artists = artists;
      info.artist = artists.map((a) => a.name).join(", ");
    }

    const description = d.description?.replace(/\s*\[This series was migrated from the old Kagane\.[^\]]*\]\s*$/, "").trim();
    if (description) info.description = description;
    const status = parseStatus(d.upload_status ?? d.publication_status);
    if (status !== "unknown") info.status = status;
    if (d.format?.trim()) info.type = d.format.trim();

    const groups: TagGroup[] = [];
    const genres = (d.genres ?? []).filter((g) => g.genre_name?.trim() && !g.is_spoiler);
    if (genres.length) {
      const g: TagGroup = { label: "Genres", kind: "genre", tags: genres.map((x) => x.genre_name.trim()) };
      if (genres.every((x) => x.genre_id)) g.tagIds = genres.map((x) => x.genre_id!);
      groups.push(g);
    }
    const tags = (d.tags ?? []).filter((t) => t.tag_name?.trim() && !t.is_spoiler);
    if (tags.length) groups.push({ label: "Tags", kind: "other", tags: tags.map((t) => t.tag_name.trim()) });
    if (groups.length) info.tagGroups = groups;

    const cells: { label: string; value: string }[] = [];
    const lang = (code: string | null | undefined) => {
      if (!code) return undefined;
      try {
        return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
      } catch {
        return code;
      }
    };
    const original = lang(d.original_language);
    if (original) cells.push({ label: "Original language", value: original });
    if (d.start_year && d.start_year > 0) cells.push({ label: "Year", value: d.end_year && d.end_year > d.start_year ? `${d.start_year}–${d.end_year}` : String(d.start_year) });
    if (d.total_views && d.total_views > 0) cells.push({ label: "Views", value: compact(d.total_views) });
    if (cells.length) info.infoCells = cells;

    const ids: Record<string, string | number> = {};
    for (const link of d.series_links ?? []) {
      const al = /anilist\.co\/manga\/(\d+)/.exec(link.url)?.[1];
      if (al) ids["anilist"] = Number(al);
      const mal = /myanimelist\.net\/manga\/(\d+)/.exec(link.url)?.[1];
      if (mal) ids["mal"] = Number(mal);
      const mu = /mangaupdates\.com\/series\/([a-z0-9]+)/i.exec(link.url)?.[1];
      if (mu) ids["mu"] = mu;
    }
    if (Object.keys(ids).length) info.externalIds = ids;
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    this.checkId(seriesId);
    const index = await this.api<IndexDto>(`${API}/series/${seriesId}/books/index?fields=List`, "this series' chapters");
    if (!Array.isArray(index.fields) || !Array.isArray(index.books)) {
      throw new Error("Kagane changed its chapter index; this bridge needs an update");
    }
    // A short index would read as chapters removed; better to fail and keep what the library has.
    if (typeof index.count === "number" && index.books.length !== index.count) throw new Error("Kagane sent an incomplete chapter index");
    const col = (name: string) => index.fields.indexOf(name);
    const at = { id: col("book_id"), sort: col("sort_no"), ch: col("chapter_no"), vol: col("volume_no"), groups: col("group_ix"), released: col("released_at"), title: col("title"), pages: col("page_count") };
    if (at.id < 0) throw new Error("Kagane changed its chapter index (no book ids); this bridge needs an update");
    const groups = index.groups ?? [];
    const rows = index.books
      .map((row) => {
        const v = (i: number) => (i >= 0 ? row[i] : undefined);
        const id = v(at.id);
        if (typeof id !== "string" || !id) return undefined;
        const chNo = typeof v(at.ch) === "string" ? (v(at.ch) as string).trim() : "";
        const volNo = typeof v(at.vol) === "string" ? (v(at.vol) as string).trim() : "";
        const title = typeof v(at.title) === "string" ? (v(at.title) as string).trim() : "";
        const sort = num(v(at.sort));
        const name = title || (chNo ? `Chapter ${chNo}` : volNo ? `Volume ${volNo}` : sort !== undefined ? `Chapter ${sort}` : "Chapter");
        const ch: Chapter = { id, name, languageCode: "en" };
        const n = num(chNo);
        if (n !== undefined) ch.number = n;
        const vol = num(volNo);
        if (vol !== undefined) ch.volume = vol;
        const ix = v(at.groups);
        const names = Array.isArray(ix) ? ix.map((i) => (typeof i === "number" ? groups[i]?.title?.trim() : undefined)).filter((t): t is string => !!t) : [];
        if (names.length) ch.group = names.join(", ");
        const pages = v(at.pages);
        if (typeof pages === "number" && Number.isInteger(pages) && pages >= 0) ch.pageCount = pages;
        const released = v(at.released);
        if (typeof released === "number" && Number.isFinite(released)) ch.publishedAt = Math.round(released * 1000);
        return { ch, sort: sort ?? n ?? 0 };
      })
      .filter((r): r is { ch: Chapter; sort: number } => r !== undefined);
    return rows.sort((a, b) => b.sort - a.sort).map((r) => r.ch);
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    this.checkId(seriesId);
    this.checkId(chapterId, "chapter removed from the source");
    const { challenge } = await this.access(chapterId);
    const pages = [...(challenge.manifest?.pages ?? [])].sort((a, b) => a.page_no - b.page_no);
    if (pages.length === 0) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const variant = this.settings.quality === "original" ? "original" : "datasaver";
    const base = challenge.cache_url.replace(/\/+$/, "");
    const covered = hostCovered(base, IMAGE_HOSTS);
    if (!covered) this.log.warn(`Kagane served pages from ${base}, which isn't a declared image host`);
    return pages.map((p, index) => {
      const url = `${base}/api/v2/books/page/${variant}/${chapterId}/${encodeURIComponent(p.page_id)}.${p.ext || "jxl"}?token=${encodeURIComponent(challenge.access_token)}`;
      // Off the declared hosts the host can't add the headers, so the page carries them itself.
      return covered ? { index, imageUrl: url } : { index, imageUrl: url, headers: { ...IMAGE_HEADERS } };
    });
  }

  /** A page URL whose access token has (nearly) expired gets the book's current one. */
  async interceptImageRequest(url: string): Promise<ImageRequest> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { url };
    }
    const m = /^\/api\/v2\/books\/page\/[^/]+\/([^/]+)\/[^/]+$/.exec(u.pathname);
    const token = u.searchParams.get("token");
    if (!m || !token || !UUID.test(m[1]!)) return { url };
    const expires = jwtExpiry(token);
    if (expires !== undefined && expires - Date.now() > TOKEN_MARGIN_MS) return { url };
    const { challenge } = await this.access(m[1]!);
    if (challenge.access_token === token) return { url };
    u.searchParams.set("token", challenge.access_token);
    return { url: u.href };
  }

  /** The book's access (token, image host, manifest), from cache while it lasts. */
  private access(bookId: string): Promise<BookAccess> {
    const cached = this.books.get(bookId);
    if (cached && cached.expiresAt - Date.now() > TOKEN_MARGIN_MS) return Promise.resolve(cached);
    const inFlight = this.pending.get(bookId);
    if (inFlight) return inFlight;
    const p = this.challenge(bookId)
      .then((challenge) => {
        const access = { challenge, expiresAt: jwtExpiry(challenge.access_token) ?? Date.now() + TOKEN_FALLBACK_MS };
        this.books.delete(bookId);
        this.books.set(bookId, access);
        while (this.books.size > MAX_CACHED_BOOKS) this.books.delete(this.books.keys().next().value!);
        return access;
      })
      .finally(() => this.pending.delete(bookId));
    this.pending.set(bookId, p);
    return p;
  }

  private async integrityToken(fresh = false): Promise<string> {
    if (!fresh && this.integrity && this.integrity.expiresAt - Date.now() > 5_000) return this.integrity.token;
    const dto = await this.api<{ token?: string; exp?: number }>(`${SITE}/api/integrity`, "a reading token", {
      body: "",
      headers: { "Content-Type": "application/json" },
    });
    if (!dto.token) throw new Error("Kagane didn't hand out a reading token; this bridge may need an update");
    this.integrity = { token: dto.token, expiresAt: typeof dto.exp === "number" ? dto.exp * 1000 : Date.now() + 60_000 };
    return dto.token;
  }

  private async challenge(bookId: string): Promise<ChallengeDto> {
    const ask = async (fresh: boolean) => {
      const token = await this.integrityToken(fresh);
      return this.request({
        url: `${API}/books/${bookId}?intent=Read`,
        method: "POST",
        headers: this.headers({ Origin: SITE, "x-integrity-token": token }),
        body: "",
      });
    };
    let res = await ask(false);
    // A rejected integrity token (revoked early, or the clock is off): get a new one, once.
    if (res.status === 401 || res.status === 403) {
      this.integrity = undefined;
      res = await ask(true);
    }
    if (res.status === 404) throw new Error(seriesGoneMessage("chapter removed from the source"));
    if (res.status >= 400) throw new Error(`Kagane answered HTTP ${res.status} for this chapter's pages`);
    let dto: ChallengeDto;
    try {
      dto = JSON.parse(res.body) as ChallengeDto;
    } catch {
      throw new Error("Kagane sent something that isn't JSON for this chapter's pages");
    }
    if (!dto.access_token || !/^https?:\/\//.test(dto.cache_url ?? "")) {
      throw new Error("Kagane changed its reader API (no access token or image host); this bridge needs an update");
    }
    return dto;
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    return linkTarget(url);
  }
}

export default defineBridge((host) => new KaganeBridge(host));

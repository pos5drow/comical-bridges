/**
 * MangaDot bridge — https://mangadot.net, a multilingual reader with a JSON API beside a React
 * Router front end:
 *  - lists & search: `/api/search?lang&search&page&limit&sortBy&sortOrder&…` (plain JSON)
 *  - details: the series page's route data, `/manga/{id}.data?_routes=pages/MangaDetailPage`, in
 *    React Router's flattened "turbo-stream" encoding (see {@link decodeTurboStream})
 *  - chapters: `/api/manga/{id}/chapters/list?lang`
 *  - pages: `/api/chapters/{id}/images`, or `/api/uploads/{id}/images` for a chapter a reader
 *    uploaded (the two number their chapters separately, so an upload's chapter id is `u{id}`)
 *
 * One bridge for every language: a Language setting picks which translations to browse and read.
 * This is the all-ages build: lists and search ask the site to leave out its erotica and
 * pornographic ratings (as the site does for a reader who wants no 18+), and anything flagged adult
 * that slips through is dropped. The site sits behind Cloudflare, whose clearance is tied to the
 * User-Agent, so every request sends the host's own browser User-Agent where it has one. Page
 * images need that session too (the host's image route carries its cookies) and the site's Referer.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type ContentRating,
  type Filter,
  type FilterValue,
  type HttpRequest,
  type HttpResponse,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PagedResults,
  type RelatedKind,
  type RelatedSeriesGroup,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SettingDescriptor,
  type SortOption,
  type TagGroup,
  type TagKind,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";

const SITE = "https://mangadot.net";
const FALLBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PAGE_SIZE = 56;
const DETAIL_ROUTE = "pages/MangaDetailPage";

/** Setting value (BCP 47) → label, and the site's own `lang` code. */
const LANGUAGES: ReadonlyArray<[string, string, string]> = [
  ["en", "English", "en"],
  ["es", "Español", "es"],
  ["es-419", "Español (Latinoamérica)", "es-la"],
  ["pt-BR", "Português (Brasil)", "pt-br"],
  ["fr", "Français", "fr"],
  ["id", "Bahasa Indonesia", "id"],
  ["it", "Italiano", "it"],
  ["de", "Deutsch", "de"],
  ["ru", "Русский", "ru"],
  ["pl", "Polski", "pl"],
  ["tr", "Türkçe", "tr"],
  ["vi", "Tiếng Việt", "vi"],
  ["th", "ไทย", "th"],
  ["ko", "한국어", "ko"],
  ["ja", "日本語", "ja"],
  ["zh", "中文", "zh"],
  ["zh-Hant", "中文 (繁體)", "zh-hk"],
];

const SORTS: ReadonlyArray<SortOption> = [
  { key: "latest", label: "Latest update" },
  { key: "tracked", label: "Most tracked" },
  { key: "rating", label: "Top rated" },
  { key: "views", label: "Most viewed" },
  { key: "chapters", label: "Total chapters" },
  { key: "alphabetical", label: "Alphabetical" },
];

const LISTS: ReadonlyArray<SeriesList & { sort: string }> = [
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, sort: "latest" },
  { id: "popular", name: "Most tracked", layout: "grid", featured: true, sort: "tracked" },
  { id: "top-rated", name: "Top rated", layout: "grid", sort: "rating" },
];

const ORIGINS: ReadonlyArray<[string, string]> = [["JP", "Manga"], ["KR", "Manhwa"], ["CN", "Manhua"], ["EN", "OEL"], ["ONESHOT", "One shot"]];
const DEMOGRAPHICS = ["Josei", "Seinen", "Shoujo", "Shounen"];

/** Genres about minors, excluded from every search. */
const MINOR_GENRES = ["Loli", "Lolicon", "Shota", "Shotacon"];

/** The site's genres (from its search facets), less demographics, formats and its 18+ genres. */
const GENRES = [
  "Action", "Adventure", "Aliens", "Animals", "Anthology", "Avant Garde", "Award Winning", "Boys Love", "Comedy",
  "Cooking", "Crime", "Crossdressing", "Delinquents", "Demons", "Doujinshi", "Drama", "Ecchi", "Fantasy",
  "Gender Bender", "Genderswap", "Ghosts", "Girls Love", "Gore", "Gyaru", "Harem", "Historical", "Horror", "Isekai",
  "Mafia", "Magic", "Mahou Shoujo", "Martial Arts", "Mature", "Mecha", "Medical", "Military", "Monster Girls",
  "Monsters", "Music", "Mystery", "Ninja", "Office Worker", "Philosophical", "Police", "Post-Apocalyptic",
  "Psychological", "Reincarnation", "Reverse Harem", "Romance", "Samurai", "School Life", "Sci-Fi", "Shoujo Ai",
  "Shounen Ai", "Slice of Life", "Sports", "Superhero", "Supernatural", "Survival", "Thriller", "Time Travel",
  "Tragedy", "Vampires", "Video Games", "Villainess", "Virtual Reality", "Wuxia", "Yaoi", "Yuri", "Zombies",
];

/** Lists and search leave these out unless a narrower rating is asked for. */
const ALL_AGES = "-erotica,-pornographic";
const RATINGS: ReadonlyArray<[string, string, string]> = [
  ["", "Safe & suggestive", ALL_AGES],
  ["safe", "Safe only", "-suggestive,-erotica,-pornographic"],
  ["suggestive", "Suggestive only", "suggestive"],
];

const TYPE_OF: Record<string, string> = { JP: "Manga", KR: "Manhwa", CN: "Manhua", EN: "OEL" };

interface BrowseDto {
  id: number;
  title: string;
  photo?: string | null;
  content_rating?: string | null;
  is_adult?: boolean | number | null;
  is_blurworthy?: boolean | number | null;
  is_longstrip?: boolean | null;
  country_of_origin?: string | null;
  latest_chapter_number?: number | string | null;
}

interface SearchDto {
  manga_list?: BrowseDto[] | null;
  pagination?: { current_page?: number; total_pages?: number } | null;
}

interface TagCategoryDto {
  category: string;
  is_adult?: boolean;
  tags?: { name: string; is_adult?: boolean }[];
}

interface MangaDto extends BrowseDto {
  description?: string | null;
  alt_titles?: string[] | null;
  genres?: string[] | null;
  tags?: TagCategoryDto[] | null;
  status?: string | null;
  authors?: string | null;
  artists?: string | null;
  year?: number | null;
  avg_rating?: number | null;
  rating_count?: number | null;
  tracked_count?: number | null;
  view_count?: number | null;
  anilist_id?: number | null;
  mal_id?: number | null;
  mangaupdates_id?: string | null;
  chapter_languages?: string[] | null;
}

interface DetailData {
  mangaData?: { manga?: MangaDto; total_chapters?: number };
  suggestions?: BrowseDto[] | null;
  relationsData?: { relations?: Record<string, BrowseDto[]> | unknown[] } | null;
}

interface ChapterDto {
  id: number;
  chapter_number?: number | string | null;
  volume_number?: number | string | null;
  chapter_title?: string | null;
  language?: string | null;
  group_name?: string | null;
  scanlator_name?: string | null;
  groups?: { name: string }[] | null;
  date_added?: string | null;
  page_count?: number | null;
  source?: string | null;
}

interface ImagesDto {
  manga?: { id?: number } | null;
  images?: { url?: string | null }[] | null;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

const truthy = (v: unknown) => v === true || v === 1;

/** A site path (`/uploads/x.webp`) or absolute URL as an absolute URL, or undefined. */
function absolute(path: string | null | undefined): string | undefined {
  const p = path?.trim();
  if (!p) return undefined;
  if (/^https?:\/\//.test(p)) return p;
  return p.startsWith("/") ? SITE + p : undefined;
}

/** The site's rating, coarsened. */
function ratingOf(m: BrowseDto): ContentRating {
  const r = m.content_rating?.toLowerCase();
  if (truthy(m.is_adult) || r === "erotica" || r === "pornographic") return "adult";
  return r === "suggestive" ? "mature" : "everyone";
}

/** `2026-05-23 12:17:22.087427+00` (Postgres, UTC) as epoch ms. */
export function parseDate(s: string | null | undefined): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-])(\d{2})(?::?(\d{2}))?|Z)?$/.exec(s?.trim() ?? "");
  if (!m) return undefined;
  const ms = Number((m[7] ?? "0").slice(0, 3).padEnd(3, "0"));
  const offset = m[8] ? (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10] ?? 0)) * 60_000 : 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms) - offset;
}

/** A JSON-encoded name list (`["A","B"]`), as the site stores credits. */
function names(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v)) return [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))];
  } catch {
    // A bare name.
  }
  return json.trim() ? [json.trim()] : [];
}

class MangaDotBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.mangadot",
    name: "MangaDot",
    version: "0.1.0",
    contractVersion: "2.1.0",
    languages: LANGUAGES.map(([code]) => code),
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    cardSubtitles: true,
    ratings: true,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 400 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["mangadot.net"],
    images: { hosts: ["mangadot.net"], headers: { Referer: `${SITE}/` } },
  };

  private readonly guards = standardGuards(["mangadot.net"]);

  protected override async request(req: HttpRequest): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  /** Cloudflare ties its clearance to the User-Agent: the host's own when it is a browser's. */
  private get ua(): string {
    const h = this.userAgent;
    return h && h.startsWith("Mozilla/5.0") ? h : FALLBACK_UA;
  }

  getSettings(): SettingDescriptor[] {
    return [
      {
        type: "enum",
        key: "language",
        label: "Language",
        description: "Which translations to browse and read.",
        options: LANGUAGES.map(([value, label]) => ({ value, label })),
        default: "en",
      },
    ];
  }

  /** The chosen language as [BCP 47 code, the site's code]. */
  private get lang(): [string, string] {
    const chosen = this.settings["language"];
    const l = LANGUAGES.find(([code]) => code === chosen) ?? LANGUAGES[0]!;
    return [l[0], l[2]];
  }

  private async get(path: string): Promise<string> {
    const res = await this.request({
      url: SITE + path,
      headers: { "User-Agent": this.ua, Accept: "application/json, */*", Referer: `${SITE}/` },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`MangaDot answered HTTP ${res.status} for ${path.replace(/\?.*$/, "")}`);
    return res.body;
  }

  private async json<T>(path: string): Promise<T> {
    const body = await this.get(path);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(`MangaDot sent something that isn't JSON for ${path.replace(/\?.*$/, "")}`);
    }
  }

  private entry(m: BrowseDto): SeriesEntry | undefined {
    if (typeof m.id !== "number" || !m.title?.trim()) return undefined;
    const e: SeriesEntry = { id: String(m.id), title: m.title.trim() };
    const cover = absolute(m.photo);
    if (cover) e.thumbnailUrl = cover;
    const latest = num(m.latest_chapter_number);
    if (latest !== undefined) e.subtitle = `Chapter ${latest}`;
    if (m.is_longstrip) {
      e.readingDirection = "vertical";
      e.coverForm = "scroll";
    } else if (m.country_of_origin === "JP") e.readingDirection = "rtl";
    e.contentRating = ratingOf(m);
    return e;
  }

  /** Cards for `list`, less anything rated adult (this build is all-ages). */
  private entries(list: BrowseDto[] | null | undefined): SeriesEntry[] {
    return (list ?? []).map((m) => this.entry(m)).filter((e): e is SeriesEntry => !!e && e.contentRating !== "adult");
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  private async search(page: number, params: Record<string, string>): Promise<PagedResults<SeriesEntry>> {
    // Genres about minors are always excluded, whatever else is asked for: the server only filters
    // by content rating, which leaves them among safe and suggestive titles.
    const genres = [...(params["genres"] ? params["genres"].split(",") : []), ...MINOR_GENRES.map((g) => `-${g}`)];
    const q = new URLSearchParams({ lang: this.lang[1], page: String(page), limit: String(PAGE_SIZE), adult: "0", content_rating: ALL_AGES, ...params, genres: [...new Set(genres)].join(",") });
    const res = await this.json<SearchDto>(`/api/search?${q}`);
    const list = res.manga_list ?? [];
    const p = res.pagination;
    return { items: this.entries(list), nextCursor: nextPageCursor(page, list.length > 0 && (p?.current_page ?? page) < (p?.total_pages ?? 0)) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _s, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.search(pageFromCursor(req.cursor), { sortBy: list.sort, sortOrder: "desc" });
  }

  async getFilters(): Promise<Filter[]> {
    const options = (values: ReadonlyArray<readonly [string, string]>) => values.map(([value, label]) => ({ value, label }));
    return [
      { type: "multiselect", key: "origin", label: "Type", options: options(ORIGINS) },
      { type: "select", key: "status", label: "Status", options: options([["Ongoing", "Ongoing"], ["Completed", "Completed"], ["Hiatus", "Hiatus"], ["Cancelled", "Cancelled"]]) },
      { type: "select", key: "rating", label: "Content rating", options: options(RATINGS.map(([v, l]) => [v, l] as const)) },
      { type: "multiselect", key: "demographic", label: "Demographic", excludable: true, options: options(DEMOGRAPHICS.map((d) => [d, d] as const)) },
      { type: "multiselect", key: "genre", label: "Genres", excludable: true, options: options(GENRES.map((g) => [g, g] as const)) },
      { type: "select", key: "min_rating", label: "Minimum score", options: options([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), `${n}+`] as const)) },
      { type: "number", key: "year_min", label: "From year", min: 1900 },
      { type: "number", key: "year_max", label: "To year", min: 1900 },
      { type: "number", key: "min_chapters", label: "Minimum chapters", min: 0 },
      { type: "text", key: "author", label: "Author" },
      { type: "text", key: "artist", label: "Artist" },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const text = req.text.trim();
    const params = searchParams(req.filters ?? []);
    if (text) params["search"] = text;
    // With text, the site's own order is relevance; without, keep it ordered by update.
    const sort = req.sort?.key ?? (text ? undefined : "latest");
    if (sort && SORTS.some((s) => s.key === sort)) {
      params["sortBy"] = sort;
      params["sortOrder"] = req.sort?.ascending ? "asc" : "desc";
    }
    return this.search(pageFromCursor(req.cursor), params);
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private checkId(seriesId: string): void {
    if (!/^\d+$/.test(seriesId)) throw new Error(seriesGoneMessage());
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    this.checkId(seriesId);
    const body = await this.get(`/manga/${seriesId}.data?_routes=${DETAIL_ROUTE}`);
    let route: { data?: DetailData } | undefined;
    try {
      route = (decodeTurboStream(body) as Record<string, { data?: DetailData }> | undefined)?.[DETAIL_ROUTE];
    } catch {
      throw new Error("MangaDot changed its series pages (their data didn't decode); this bridge needs an update");
    }
    const data = route?.data;
    const m = data?.mangaData?.manga;
    if (!m || !m.title) throw new Error(seriesGoneMessage());

    const title = m.title.trim();
    const info: SeriesInfo = { id: seriesId, title, shareUrl: `${SITE}/manga/${seriesId}`, contentRating: ratingOf(m) };
    const cover = absolute(m.photo);
    if (cover) info.thumbnailUrl = cover;
    if (m.is_longstrip) {
      info.readingDirection = "vertical";
      info.coverForm = "scroll";
    } else if (m.country_of_origin === "JP") info.readingDirection = "rtl";
    const alts = [...new Set((m.alt_titles ?? []).map((a) => a.trim()).filter((a) => a && a !== title))];
    if (alts.length) info.altTitles = alts;
    const description = m.description?.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (description) info.description = description;
    const authors = names(m.authors);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    const artists = names(m.artists);
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    const status = parseStatus(m.status);
    if (status !== "unknown") info.status = status;
    const type = TYPE_OF[m.country_of_origin ?? ""];
    if (type) info.type = type;

    const groups: TagGroup[] = [];
    const genres = (m.genres ?? []).map((g) => g.trim()).filter(Boolean);
    const plain = genres.filter((g) => !DEMOGRAPHICS.includes(g));
    const demo = genres.filter((g) => DEMOGRAPHICS.includes(g));
    if (plain.length) groups.push({ label: "Genres", kind: "genre", tags: plain });
    if (demo.length) groups.push({ label: "Demographic", kind: "demographic", tags: demo });
    for (const cat of m.tags ?? []) {
      if (cat.is_adult || !cat.category?.trim()) continue;
      const tags = (cat.tags ?? []).filter((t) => !t.is_adult).map((t) => t.name.trim()).filter(Boolean);
      if (tags.length) groups.push({ label: cat.category.trim(), kind: tagKindOf(cat.category), tags });
    }
    if (groups.length) info.tagGroups = groups;

    if (typeof m.avg_rating === "number" && m.avg_rating > 0 && m.avg_rating <= 10) {
      info.rating = { score: m.avg_rating / 10, ...(typeof m.rating_count === "number" && m.rating_count >= 0 ? { votes: m.rating_count } : {}) };
    }
    const cells: { label: string; value: string }[] = [];
    if (m.year) cells.push({ label: "Year", value: String(m.year) });
    const chapters = num(data?.mangaData?.total_chapters) ?? num((m as { chapter_count?: number }).chapter_count);
    if (chapters) cells.push({ label: "Chapters", value: String(chapters) });
    if (typeof m.tracked_count === "number") cells.push({ label: "Tracked", value: m.tracked_count.toLocaleString("en-US") });
    if (typeof m.view_count === "number") cells.push({ label: "Views", value: m.view_count.toLocaleString("en-US") });
    if (cells.length) info.infoCells = cells;
    if (m.chapter_languages?.length) info.languages = m.chapter_languages;

    const ids: Record<string, string | number> = {};
    if (typeof m.anilist_id === "number" && m.anilist_id > 0) ids["anilist"] = m.anilist_id;
    if (typeof m.mal_id === "number" && m.mal_id > 0) ids["mal"] = m.mal_id;
    if (m.mangaupdates_id?.trim()) ids["mu"] = m.mangaupdates_id.trim();
    if (Object.keys(ids).length) info.externalIds = ids;

    const related: RelatedSeriesGroup[] = [];
    const relations = data?.relationsData?.relations;
    if (relations && !Array.isArray(relations)) {
      for (const [key, list] of Object.entries(relations)) {
        const series = this.entries(Array.isArray(list) ? list : []);
        if (series.length) related.push({ label: labelOf(key), kind: relatedKindOf(key), series });
      }
    }
    const similar = this.entries(data?.suggestions);
    if (similar.length) related.push({ label: "You may also like", kind: "recommended", series: similar });
    if (related.length) info.relatedSeriesGroups = related;
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    this.checkId(seriesId);
    const [code, site] = this.lang;
    const list = await this.json<ChapterDto[]>(`/api/manga/${seriesId}/chapters/list?lang=${encodeURIComponent(site)}`);
    if (!Array.isArray(list)) throw new Error("MangaDot changed its chapter lists; this bridge needs an update");
    return list
      .filter((c) => typeof c.id === "number" && (!c.language || c.language.toLowerCase() === site))
      .map((c) => {
        const number = num(c.chapter_number);
        const title = c.chapter_title?.trim() ?? "";
        const label = number === undefined ? "" : String(number);
        const name = !title ? (label ? `Chapter ${label}` : `Chapter ${c.id}`) : label && !title.includes(label) ? `Chapter ${label}: ${title}` : title;
        const ch: Chapter = { id: chapterIdOf(c.id, c.source), name, languageCode: code };
        if (number !== undefined) ch.number = number;
        const volume = num(c.volume_number);
        if (volume !== undefined && volume > 0) ch.volume = volume;
        const group = (c.groups ?? []).map((g) => g.name?.trim()).filter(Boolean).join(" • ") || c.group_name?.trim() || c.scanlator_name?.trim();
        if (group) ch.group = group;
        if (typeof c.page_count === "number" && c.page_count >= 0) ch.pageCount = c.page_count;
        const at = parseDate(c.date_added);
        if (at !== undefined) ch.publishedAt = at;
        return ch;
      })
      .reverse();
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const res = await this.images(chapterId);
    if (res.manga?.id !== undefined && String(res.manga.id) !== seriesId) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const pages = (res.images ?? []).map((i) => absolute(i.url)).filter((u): u is string => !!u);
    if (pages.length === 0) throw new Error(seriesGoneMessage("chapter removed from the source"));
    return pages.map((imageUrl, index) => ({ index, imageUrl }));
  }

  private images(chapterId: string): Promise<ImagesDto> {
    const m = /^(u?)(\d+)$/.exec(chapterId);
    if (!m) throw new Error(seriesGoneMessage("chapter removed from the source"));
    return this.json<ImagesDto>(`/api/${m[1] ? "uploads" : "chapters"}/${m[2]}/images`);
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (!/(^|\.)mangadot\.net$/.test(u.hostname)) return null;
    const [kind, id] = u.pathname.split("/").filter(Boolean);
    if (!id || !/^\d+$/.test(id)) return null;
    if (kind === "manga") return { seriesId: id };
    if (kind === "chapter") {
      // The site marks a reader's upload with `?source=user`; a plain link is one of its own chapters.
      const chapterId = chapterIdOf(Number(id), u.searchParams.get("source") ?? "scraper");
      const mangaId = (await this.images(chapterId)).manga?.id;
      return typeof mangaId === "number" ? { seriesId: String(mangaId), chapterId } : null;
    }
    return null;
  }
}

/** A chapter's id: the site's own chapters by number, a reader's upload (the API's default source) as `u{id}`. */
function chapterIdOf(id: number, source: string | null | undefined): string {
  return (source ?? "user") === "user" ? `u${id}` : String(id);
}

function tagKindOf(category: string): TagKind {
  const c = category.toLowerCase();
  if (c.includes("demographic")) return "demographic";
  if (c.includes("work info") || c.includes("format")) return "format";
  if (c.includes("content") || c.includes("warning")) return "content-warning";
  return "theme";
}

function labelOf(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : "Related";
}

function relatedKindOf(key: string): RelatedKind {
  const k = key.toLowerCase().replace(/[_\s]+/g, "-");
  const known: RelatedKind[] = ["sequel", "prequel", "spin-off", "side-story", "alternative", "same-universe", "adaptation"];
  return known.find((r) => k.startsWith(r) || k === r.replace("-", "")) ?? "other";
}

/** The `/api/search` parameters for these filters (the all-ages rating unless a narrower one is chosen). */
export function searchParams(filters: readonly FilterValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  const value = (key: string) => filters.find((f) => f.key === key)?.value;
  const str = (key: string) => {
    const v = value(key);
    return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  };
  const includeExclude = (key: string, allowed: readonly string[]): string[] => {
    const v = value(key);
    const ok = (x: unknown): x is string => typeof x === "string" && allowed.includes(x);
    if (Array.isArray(v)) return v.filter(ok);
    if (v && typeof v === "object" && "include" in v) {
      const ie = v as { include?: unknown[]; exclude?: unknown[] };
      return [...(ie.include ?? []).filter(ok), ...(ie.exclude ?? []).filter(ok).map((x) => `-${x}`)];
    }
    return [];
  };

  const origins = includeExclude("origin", ORIGINS.map(([v]) => v)).filter((o) => !o.startsWith("-"));
  if (origins.length && origins.length < ORIGINS.length) out["origin"] = origins.join(",");
  const status = str("status");
  if (["Ongoing", "Completed", "Hiatus", "Cancelled"].includes(status)) out["status"] = status;
  const rating = RATINGS.find(([v]) => v === str("rating"));
  if (rating) out["content_rating"] = rating[2];
  const genres = [...includeExclude("demographic", DEMOGRAPHICS), ...includeExclude("genre", GENRES)];
  if (genres.length) out["genres"] = genres.join(",");
  const minRating = str("min_rating");
  if (/^[1-9]$/.test(minRating)) out["min_rating"] = minRating;
  for (const key of ["year_min", "year_max", "min_chapters"]) {
    const n = str(key);
    if (/^\d{1,4}$/.test(n)) out[key] = n;
  }
  for (const key of ["author", "artist"]) {
    const t = str(key);
    if (t) out[key] = t;
  }
  return out;
}

/**
 * React Router's flattened "turbo-stream" encoding, decoded. The first line is a JSON array: entry 0
 * is the root, and every value refers to others by index — an object is `{"_k": v}` where `k`
 * indexes its key's string and `v` its value, an array lists indices, and an array opening with a
 * string is a typed value (`["D", ms]` a date, `["P", n]` a promise settled on a later `Pn:` line,
 * `["Z", i]` a value sent earlier). Negative indices are special values (null, undefined, a hole,
 * NaN, ±Infinity, -0); this reads them all as absent. Later lines append to the array.
 */
export function decodeTurboStream(body: string): unknown {
  const lines = body.split("\n").filter((l) => l.trim());
  if (!lines.length) return undefined;
  const flat = JSON.parse(lines[0]!) as unknown[];
  if (!Array.isArray(flat)) throw new Error("not a turbo-stream payload");
  const promises = new Map<number, number>();
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const head = line.slice(0, colon);
    const value: unknown = JSON.parse(line.slice(colon + 1));
    let at: number;
    if (Array.isArray(value)) {
      at = flat.length;
      flat.push(...value);
    } else if (typeof value === "number") at = value;
    else continue;
    if (head[0] === "P") promises.set(Number(head.slice(1)), at);
  }

  const cache = new Map<number, unknown>();
  const resolve = (i: unknown): unknown => {
    if (typeof i !== "number" || i < 0 || i >= flat.length) return undefined;
    if (cache.has(i)) return cache.get(i);
    const el = flat[i];
    if (Array.isArray(el)) {
      if (typeof el[0] === "string") {
        cache.set(i, undefined); // guards a self-reference
        let out: unknown;
        switch (el[0]) {
          case "P": {
            const at = promises.get(el[1] as number);
            out = at === undefined ? undefined : resolve(at);
            break;
          }
          case "Z":
            out = resolve(el[1]);
            break;
          case "D":
          case "U":
          case "B":
            out = el[1];
            break;
          case "S":
            out = el.slice(1).map(resolve);
            break;
          default:
            out = undefined;
        }
        cache.set(i, out);
        return out;
      }
      const arr: unknown[] = [];
      cache.set(i, arr);
      for (const x of el) arr.push(resolve(x));
      return arr;
    }
    if (el && typeof el === "object") {
      const obj: Record<string, unknown> = {};
      cache.set(i, obj);
      for (const [k, v] of Object.entries(el)) {
        const key = flat[Number(k.slice(1))];
        if (typeof key !== "string") continue;
        const val = resolve(v);
        if (val !== undefined) obj[key] = val;
      }
      return obj;
    }
    cache.set(i, el);
    return el;
  };
  return resolve(0);
}

export default defineBridge((host) => new MangaDotBridge(host));

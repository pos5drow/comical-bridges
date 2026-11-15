/**
 * Manga Ball bridge — https://mangaball.com, a multilingual JSON API:
 *  - lists & search: `/api/v1/title/search-advanced?page&limit&sort_by&sort_order&keyword&chapterLanguage&…`
 *  - details: `/api/v1/title/detail/{slug}`
 *  - chapters: `POST /api/v1/chapter/chapter-listing-by-title-id` `{title_id}` (every language)
 *  - pages: `/api/v1/chapter-detail?chapter_id`
 *
 * One bridge for every language: a Language setting picks which translations to browse and read
 * (the site's own codes, some languages spanning several). The detail route takes a slug and the
 * chapter list a title id, so a series id is `{titleId}:{slug}`. Page images live on rotating
 * subdomains and need a mangaball.com Referer.
 * Titles flagged `is18plus` are rated adult.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Filter,
  type HttpResponse,
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
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseAbsoluteDate, parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";

const SITE = "https://mangaball.com";
const COVERS = "https://bulbasaur.poke-black-and-white.net/covers/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** The CDN's base domains; files sit on rotating subdomains of these. */
const IMAGE_DOMAINS = ["red-and-blue.net", "poke-black-and-white.net", "gold-and-silver.net", "ruby-and-sapphire.net", "mangaball.com"];

/** Setting value → the site's language codes. */
const LANGUAGES: ReadonlyArray<[string, string, string[]]> = [
  ["en", "English", ["en"]],
  ["es", "Español", ["es", "es-ar", "es-mx", "es-es", "es-la", "es-419"]],
  ["pt-BR", "Português (Brasil)", ["pt-br", "pt-pt"]],
  ["fr", "Français", ["fr"]],
  ["id", "Bahasa Indonesia", ["id"]],
  ["vi", "Tiếng Việt", ["vi"]],
  ["it", "Italiano", ["it", "it-it"]],
  ["de", "Deutsch", ["de"]],
  ["ru", "Русский", ["ru"]],
  ["pl", "Polski", ["pl"]],
  ["tr", "Türkçe", ["tr"]],
  ["ar", "العربية", ["ar"]],
  ["th", "ไทย", ["th", "th-hk", "th-kh", "th-la", "th-my", "th-sg"]],
  ["ja", "日本語", ["ja", "jp"]],
  ["ko", "한국어", ["ko", "kr"]],
  ["zh", "中文", ["zh", "zh-cn", "zh-hk", "zh-mo", "zh-sg", "zh-tw", "cn"]],
];

interface ImageDto {
  file?: string | null;
  cdn_mangadex?: string | null;
  cdn_mangaupdate?: string | null;
  cdn_mangaupdates?: string | null;
  cover?: { path?: string | null } | null;
}

interface TitleDto {
  id: string;
  slug: string;
  name: string;
  image?: ImageDto | null;
  is18plus?: boolean | null;
  description?: string[] | string | null;
  alternateName?: string[] | null;
  tags?: { name: string }[] | null;
  author?: { name: string }[] | null;
  status?: string | null;
  rating?: number | null;
  rating_count?: number | null;
}

interface ChapterDto {
  id: string;
  name?: string | null;
  number?: number | null;
  volume?: number | null;
  lang: string;
  group?: { name?: string } | null;
  created_at?: string | null;
}

const SORTS: ReadonlyArray<SortOption> = [
  { key: "views", label: "Most viewed" },
  { key: "lastupdate", label: "Latest update" },
  { key: "created_at", label: "Newest" },
  { key: "name", label: "Name" },
];

const LISTS: ReadonlyArray<SeriesList & { sort: string }> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true, sort: "views" },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, sort: "lastupdate" },
];

/** The site's cover priority: its own copy first, the mirrors it took it from as fallbacks. */
function coverOf(img: ImageDto | null | undefined): string | undefined {
  const own = img?.cover?.path?.trim().replace(/\\/g, "/");
  if (own) return own.startsWith("http") ? own : COVERS + own;
  return [img?.file, img?.cdn_mangadex, img?.cdn_mangaupdate, img?.cdn_mangaupdates].find((u) => !!u?.trim()) ?? undefined;
}

class MangaBallBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.mangaball",
    name: "Manga Ball",
    version: "0.1.0",
    contractVersion: "2.1.0",
    languages: LANGUAGES.map(([code]) => code),
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    ratings: true,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 300 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    images: { hosts: IMAGE_DOMAINS, headers: { Referer: `${SITE}/` } },
    linkHosts: ["mangaball.com", "mangaball.net"],
  };

  private readonly guards = standardGuards(["mangaball.com", "mangaball.net", ...IMAGE_DOMAINS, "mangadex.org"]);

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

  private get langCodes(): string[] {
    const chosen = this.settings["language"];
    return (LANGUAGES.find(([code]) => code === chosen) ?? LANGUAGES[0]!)[2];
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards);
  }

  private async api<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.request({
      url: `${SITE}/api/v1${path}`,
      ...(body !== undefined ? { method: "POST" as const, body: JSON.stringify(body) } : {}),
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: `${SITE}/`,
        "X-Requested-With": "XMLHttpRequest",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`Manga Ball answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Manga Ball sent something that isn't JSON for ${path}`);
    }
  }

  private entry(t: TitleDto): SeriesEntry {
    const e: SeriesEntry = { id: `${t.id}:${t.slug}`, title: t.name.trim() };
    const cover = coverOf(t.image);
    if (cover) e.thumbnailUrl = cover;
    if (t.is18plus) e.contentRating = "adult";
    return e;
  }

  /** `{titleId}:{slug}` back into its parts. */
  private parts(seriesId: string): { id: string; slug: string } {
    const i = seriesId.indexOf(":");
    if (i < 1) throw new Error(seriesGoneMessage());
    return { id: seriesId.slice(0, i), slug: seriesId.slice(i + 1) };
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  private async search(page: number, params: Record<string, string>): Promise<PagedResults<SeriesEntry>> {
    const q = new URLSearchParams({
      page: String(page),
      limit: "24",
      tag_mode: "AND",
      adult_mode: "all",
      chapterLanguage: this.langCodes.join(","),
      ...params,
    });
    const res = await this.api<{ data: TitleDto[]; pagination?: { page?: number; total_pages?: number } }>(`/title/search-advanced?${q}`);
    const p = res.pagination;
    return { items: res.data.map((t) => this.entry(t)), nextCursor: nextPageCursor(page, (p?.page ?? page) < (p?.total_pages ?? 0)) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _s, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.search(pageFromCursor(req.cursor), { sort_by: list.sort, sort_order: "desc" });
  }

  async getFilters(): Promise<Filter[]> {
    const select = (key: string, label: string, values: [string, string][]): Filter => ({
      type: "select",
      key,
      label,
      options: values.map(([value, l]) => ({ value, label: l })),
    });
    return [
      select("status", "Status", [["ongoing", "Ongoing"], ["completed", "Completed"], ["hiatus", "Hiatus"], ["cancelled", "Cancelled"]]),
      select("publicationDemographic", "Demographic", [["shounen", "Shounen"], ["shoujo", "Shoujo"], ["seinen", "Seinen"], ["josei", "Josei"]]),
      select("originalLanguage", "Original language", [["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["en", "English"]]),
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const params: Record<string, string> = {};
    if (req.text.trim()) params["keyword"] = req.text.trim();
    // Relevance is the API's order when sort_by is left out; without a keyword, keep it ordered.
    const sort = req.sort?.key ?? (req.text.trim() ? undefined : "lastupdate");
    if (sort) {
      params["sort_by"] = sort;
      params["sort_order"] = req.sort?.ascending ? "asc" : "desc";
    }
    for (const f of req.filters ?? []) {
      if (typeof f.value === "string" && f.value) params[f.key] = f.value;
    }
    return this.search(pageFromCursor(req.cursor), params);
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { slug } = this.parts(seriesId);
    const { data: t } = await this.api<{ data: TitleDto }>(`/title/detail/${encodeURIComponent(slug)}`);
    const info: SeriesInfo = { ...this.entry(t), id: seriesId, shareUrl: `${SITE}/title-detail/${t.slug}` };
    const desc = (Array.isArray(t.description) ? t.description : [t.description ?? ""]).map((d) => d.trim()).filter(Boolean).join("\n\n");
    if (desc) info.description = desc;
    const alts = (t.alternateName ?? []).map((a) => a.trim()).filter(Boolean);
    if (alts.length) info.altTitles = [...new Set(alts)];
    const status = parseStatus(t.status);
    if (status !== "unknown") info.status = status;
    const authors = [...new Set((t.author ?? []).map((a) => a.name.trim()).filter(Boolean))];
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    const tags = (t.tags ?? []).map((g) => g.name.trim()).filter(Boolean);
    if (tags.length) info.tagGroups = [{ label: "Tags", kind: "genre", tags }];
    if (typeof t.rating === "number" && t.rating > 0 && t.rating <= 10) {
      info.rating = typeof t.rating_count === "number" ? { score: t.rating / 10, votes: t.rating_count } : { score: t.rating / 10 };
    }
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { id } = this.parts(seriesId);
    const res = await this.api<{ data: ChapterDto[] }>("/chapter/chapter-listing-by-title-id", { title_id: id });
    const langs = new Set(this.langCodes);
    return res.data
      .filter((c) => langs.has(c.lang))
      .map((c) => {
        const label = c.name?.trim() || (typeof c.number === "number" ? `Ch. ${c.number}` : c.id);
        const name = c.volume && c.volume > 0 && !/vol/i.test(label) ? `Vol. ${c.volume} ${label}` : label;
        const ch: Chapter = { id: c.id, name, languageCode: c.lang };
        if (typeof c.number === "number") ch.number = c.number;
        if (c.volume && c.volume > 0) ch.volume = c.volume;
        if (c.group?.name?.trim()) ch.group = c.group.name.trim();
        // UTC without a zone, to the microsecond; keep milliseconds, which every engine parses.
        const at = c.created_at ? parseAbsoluteDate(`${c.created_at.replace(/(\.\d{3})\d*$/, "$1")}Z`) : undefined;
        if (at !== undefined) ch.publishedAt = at;
        return ch;
      });
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const res = await this.api<{ data?: { chapter?: { pages?: string[] } } }>(`/chapter-detail?chapter_id=${encodeURIComponent(chapterId)}`);
    return (res.data?.chapter?.pages ?? []).filter((u) => /^https?:/.test(u)).map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?mangaball\.(?:com|net)\/(title-detail|chapter-detail)\/([^/?#]+)/.exec(url);
    if (!m) return null;
    if (m[1] === "title-detail") {
      const { data } = await this.api<{ data: TitleDto }>(`/title/detail/${encodeURIComponent(m[2]!)}`);
      return { seriesId: `${data.id}:${data.slug}` };
    }
    const res = await this.api<{ data?: { chapter?: { title_id?: string } } }>(`/chapter-detail?chapter_id=${encodeURIComponent(m[2]!)}`);
    const titleId = res.data?.chapter?.title_id;
    if (!titleId) return null;
    const { data } = await this.api<{ data: TitleDto }>(`/title/detail/${encodeURIComponent(titleId)}`);
    return { seriesId: `${data.id}:${data.slug}`, chapterId: m[2]! };
  }
}

export default defineBridge((host) => new MangaBallBridge(host));
